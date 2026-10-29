import { ConnectorStatusInfo } from '../types/legalDomain.ts';

const ALLOWED_LEGAL_DOMAINS = new Set([
  'www.law.go.kr',
  'open.law.go.kr',
  'law.go.kr',
  'www.moleg.go.kr',
  'www.g2b.go.kr',
  'www.pps.go.kr',
  'ebid.lh.or.kr',
  'www.lh.or.kr',
  'www.elis.go.kr',
]);

/**
 * SSRF Guard: validates that an external URL belongs to an allowlisted official Korean legal/procurement domain
 * and never targets localhost, loopback, link-local metadata, or private network ranges.
 */
export function validateAllowlistedSourceUrl(urlStr: string): {
  allowed: boolean;
  normalizedUrl?: string;
  errorKo?: string;
} {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return {
        allowed: false,
        errorKo: '보안 차단(SSRF 방지): http 또는 https 프로토콜만 허용됩니다.',
      };
    }

    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.startsWith('169.254.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return {
        allowed: false,
        errorKo: '보안 차단(SSRF 방지): 내부 네트워크 및 메타데이터 IP 대역 접근이 차단되었습니다.',
      };
    }

    if (!ALLOWED_LEGAL_DOMAINS.has(host)) {
      return {
        allowed: false,
        errorKo: `보안 차단(SSRF 허용목록 외 도메인): [${host}]는 허용된 공식 법령·조달 출처 도메인(${Array.from(
          ALLOWED_LEGAL_DOMAINS
        ).join(', ')})이 아닙니다.`,
      };
    }

    return { allowed: true, normalizedUrl: parsed.toString() };
  } catch {
    return {
      allowed: false,
      errorKo: '유효하지 않은 URL 형식입니다. 공식 법령정보센터 또는 발주기관 URL을 입력하십시오.',
    };
  }
}

export interface LawGoKrRetrievalOutcome {
  ok: boolean;
  errorCode?:
    | 'UNCONFIGURED_LIVE_API'
    | 'TIMEOUT'
    | 'RATE_LIMIT'
    | 'UNSUPPORTED_HISTORICAL_COVERAGE'
    | 'EMPTY_RESULT'
    | 'MALFORMED_RESPONSE'
    | 'INACCESSIBLE_SOURCE'
    | 'SSRF_BLOCKED';
  messageKo: string;
  actionableStepsKo: string[];
  endpointCalled?: string;
  retrievedAt: string;
  rawPayload?: unknown;
}

/**
 * Verified endpoints from https://open.law.go.kr/LSO/openApi/guideList.do:
 * - Search list: http://www.law.go.kr/DRF/lawSearch.do?OC={OC}&target={law|eflaw|admrul|ordin|licbyl}&type=JSON&query={query}
 * - Service detail: http://www.law.go.kr/DRF/lawService.do?OC={OC}&target={law|eflaw|lsHistory|admrul|ordin}&type=JSON&MST={mst}&ID={id}
 */
export async function queryLawGoKrOpenApi(params: {
  mode: 'SEARCH' | 'SERVICE';
  target: 'law' | 'eflaw' | 'lsHistory' | 'admrul' | 'ordin' | 'licbyl';
  query?: string;
  mst?: string;
  id?: string;
  efYd?: string;
  ocOverride?: string;
  simulatedFailureMode?:
    | 'TIMEOUT'
    | 'RATE_LIMIT'
    | 'EMPTY_RESULT'
    | 'MALFORMED_RESPONSE'
    | 'UNSUPPORTED_HISTORICAL_COVERAGE';
}): Promise<LawGoKrRetrievalOutcome> {
  const retrievedAt = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).replace(' ', 'T') + '+09:00';
  const oc = (params.ocOverride ?? process.env.LAW_GO_KR_OC ?? '').trim();

  // 1. Check if live credentials (OC) are configured
  if (!oc || oc === 'MY_LAW_GO_KR_OC') {
    return {
      ok: false,
      errorCode: 'UNCONFIGURED_LIVE_API',
      messageKo:
        '실시간 법령 연결 미설정: 국가법령정보센터(open.law.go.kr) Open API 인증값(LAW_GO_KR_OC)이 서버 환경변수에 설정되지 않았습니다.',
      actionableStepsKo: [
        '1. 국가법령정보 공동활용(https://open.law.go.kr/LSO/openApi/guideList.do)에서 Open API 활용 신청 및 승인 완료',
        '2. 서버 환경변수(Secrets)에 LAW_GO_KR_OC="신청한_이메일_ID" 설정 (브라우저 노출 금지)',
        '3. 실시간 연결 설정 전까지는 [공식 연혁 법령 원문 파일 수동 업로드] 또는 분리된 [데모 워크스페이스]를 사용하십시오.',
      ],
      retrievedAt,
    };
  }

  // 2. Deterministic failure handling for acceptance tests & resilience verification
  if (params.simulatedFailureMode === 'TIMEOUT') {
    return {
      ok: false,
      errorCode: 'TIMEOUT',
      messageKo:
        '국가법령정보센터 DRF 서버 응답 시간 초과(Timeout): 제한 시간(8,000ms) 내에 원문 응답을 수신하지 못했습니다.',
      actionableStepsKo: [
        '잠시 후 [재시도] 버튼으로 다시 요청하십시오.',
        '지속적인 지연 발생 시 국가법령정보센터에서 내려받은 공인 연혁 법령 PDF/텍스트를 수동 업로드하여 검토를 계속하십시오.',
      ],
      retrievedAt,
    };
  }

  if (params.simulatedFailureMode === 'RATE_LIMIT') {
    return {
      ok: false,
      errorCode: 'RATE_LIMIT',
      messageKo:
        '국가법령정보센터 Open API 호출 한도 초과(HTTP 429): 일일 허용 트래픽 또는 동시 요청 제한에 도달했습니다.',
      actionableStepsKo: [
        '동시 다량 조문 조회를 줄이고 필수 기준일 버전(MST) 단위로 단건 조회하십시오.',
        '기수집된 서버 영구 저장소(SourceRecord) 캐시 원문을 우선 활용하십시오.',
      ],
      retrievedAt,
    };
  }

  if (params.simulatedFailureMode === 'UNSUPPORTED_HISTORICAL_COVERAGE') {
    return {
      ok: false,
      errorCode: 'UNSUPPORTED_HISTORICAL_COVERAGE',
      messageKo:
        '해당 시점 원문 미확보: 요청하신 과거 특정 시점의 행정규칙(계약예규)·자치법규 연혁 본문은 Open API에서 제공되지 않거나 누락되어 있습니다.',
      actionableStepsKo: [
        '현행 법령이나 타 시점 예규로 임의 대체하지 마십시오.',
        '기획재정부·행정안전부·발주기관 관보 또는 문서고에서 해당 시행일 당시 계약예규 원문을 확보하여 수동 업로드하십시오.',
      ],
      retrievedAt,
    };
  }

  if (params.simulatedFailureMode === 'EMPTY_RESULT') {
    return {
      ok: false,
      errorCode: 'EMPTY_RESULT',
      messageKo: `검색 결과 없음: 질의어("${params.query || params.id || params.mst || ''}")에 일치하는 공식 법령·조문이 조회되지 않았습니다.`,
      actionableStepsKo: [
        '약칭 대신 공식 법령 제명(예: "국가를 당사자로 하는 계약에 관한 법률 시행령")으로 다시 검색하십시오.',
      ],
      retrievedAt,
    };
  }

  if (params.simulatedFailureMode === 'MALFORMED_RESPONSE') {
    return {
      ok: false,
      errorCode: 'MALFORMED_RESPONSE',
      messageKo:
        '국가법령정보센터 응답 구문 오류(Malformed JSON/XML): 원문 응답 데이터 형식이 손상되었거나 미승인 IP 차단 안내 HTML이 반환되었습니다.',
      actionableStepsKo: [
        'open.law.go.kr 마이페이지에서 서버 공인 IP 또는 도메인 등록 여부를 확인하십시오.',
        '불완전한 응답을 법령 원문으로 저장하지 않고 폐기하였습니다.',
      ],
      retrievedAt,
    };
  }

  // 3. Build verified DRF URL
  const basePath =
    params.mode === 'SEARCH'
      ? 'http://www.law.go.kr/DRF/lawSearch.do'
      : 'http://www.law.go.kr/DRF/lawService.do';
  const url = new URL(basePath);
  url.searchParams.set('OC', oc);
  url.searchParams.set('target', params.target);
  url.searchParams.set('type', 'JSON');
  if (params.query) url.searchParams.set('query', params.query);
  if (params.mst) url.searchParams.set('MST', params.mst);
  if (params.id) url.searchParams.set('ID', params.id);
  if (params.efYd) url.searchParams.set('efYd', params.efYd);

  const ssrfCheck = validateAllowlistedSourceUrl(url.toString());
  if (!ssrfCheck.allowed) {
    return {
      ok: false,
      errorCode: 'SSRF_BLOCKED',
      messageKo: ssrfCheck.errorKo || 'SSRF 차단',
      actionableStepsKo: ['공식 도메인만 호출할 수 있습니다.'],
      retrievedAt,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json, application/xml, text/plain',
      },
    });
    clearTimeout(timeout);

    if (response.status === 429) {
      return {
        ok: false,
        errorCode: 'RATE_LIMIT',
        messageKo: '국가법령정보센터 API 요청 한도 초과(HTTP 429)가 발생했습니다.',
        actionableStepsKo: ['잠시 후 재시도하십시오.'],
        endpointCalled: basePath,
        retrievedAt,
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        errorCode: 'INACCESSIBLE_SOURCE',
        messageKo: `국가법령정보센터 API 응답 오류 (HTTP ${response.status})`,
        actionableStepsKo: [
          'open.law.go.kr 서비스 상태 및 OC 인증키 승인 상태를 확인하십시오.',
        ],
        endpointCalled: basePath,
        retrievedAt,
      };
    }

    const text = await response.text();
    try {
      const parsed = JSON.parse(text);
      return {
        ok: true,
        messageKo: '국가법령정보센터 공식 Open API 원문 수신 완료',
        actionableStepsKo: [],
        endpointCalled: basePath,
        retrievedAt,
        rawPayload: parsed,
      };
    } catch {
      return {
        ok: false,
        errorCode: 'MALFORMED_RESPONSE',
        messageKo:
          '국가법령정보센터 응답이 유효한 JSON 형식이 아닙니다 (인증키 미승인 안내 페이지 또는 XML 반환 가능성).',
        actionableStepsKo: [
          'open.law.go.kr에서 해당 OC 계정의 JSON 응답 권한 및 서버 IP 승인 상태를 확인하십시오.',
        ],
        endpointCalled: basePath,
        retrievedAt,
      };
    }
  } catch (err: unknown) {
    clearTimeout(timeout);
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      errorCode: isAbort ? 'TIMEOUT' : 'INACCESSIBLE_SOURCE',
      messageKo: isAbort
        ? '국가법령정보센터 Open API 연결 시간 초과(8초)가 발생했습니다.'
        : `국가법령정보센터 네트워크 접근 실패: ${err instanceof Error ? err.message : String(err)}`,
      actionableStepsKo: [
        '네트워크 방화벽에서 www.law.go.kr (포트 80/443) 아웃바운드 허용 여부를 확인하십시오.',
        '오프라인 환경일 경우 공식 연혁 원문 파일을 직접 업로드하여 증거로 등록하십시오.',
      ],
      endpointCalled: basePath,
      retrievedAt,
    };
  }
}

/**
 * Returns transparent, accurate status and source-category coverage for all connectors.
 */
export function getConnectorStatuses(lastRetrievalTime: string | null): ConnectorStatusInfo[] {
  const oc = (process.env.LAW_GO_KR_OC || '').trim();
  const isMolegConfigured = Boolean(oc && oc !== 'MY_LAW_GO_KR_OC');

  return [
    {
      connectorId: 'MOLEG_OPEN_API',
      name: '국가법령정보센터 Open API (법제처 DRF)',
      provider: '법제처 국가법령정보 공동활용 (open.law.go.kr)',
      status: isMolegConfigured ? 'CONNECTED' : 'UNCONFIGURED_LIVE_API',
      statusLabel: isMolegConfigured ? '실시간 API 키 설정됨' : '실시간 법령 연결 미설정',
      availableCategories: [
        {
          category: 'STATUTE',
          label: '현행·연혁 법률 (target=law, eflaw, lsHistory)',
          supported: true,
          coverageNote: 'MST(법령일련번호) 및 시행일(efYd) 기준 본문·부칙·제개정이유 조회 지원',
        },
        {
          category: 'ENFORCEMENT_DECREE',
          label: '대통령령·시행령 (target=law, eflaw)',
          supported: true,
          coverageNote: '현행 및 연혁 시행령 조문·부칙 조회 지원',
        },
        {
          category: 'ENFORCEMENT_RULE',
          label: '총리령·부령·시행규칙 (target=law, eflaw, licbyl)',
          supported: true,
          coverageNote: '본문·부칙 및 별표·서식(target=licbyl) 메타데이터/파일 링크 지원',
        },
        {
          category: 'ADMINISTRATIVE_RULE',
          label: '중앙부처 행정규칙·계약예규 (target=admrul)',
          supported: true,
          coverageNote:
            '현행 행정규칙 조회 지원. 단, 과거 폐지·개정된 구(舊) 계약예규 일부 연혁은 API 미제공 시 수동 원문 첨부 필수',
        },
        {
          category: 'LOCAL_ORDINANCE',
          label: '지방자치단체 조례·규칙 (target=ordin)',
          supported: true,
          coverageNote: '지자체 조례·규칙 본문 및 부칙 조회 지원 (일부 과거 연혁 조례 제외)',
        },
        {
          category: 'CONTRACT_GENERAL_CONDITIONS',
          label: '개별 공사 편입 계약조건·특수조건',
          supported: false,
          coverageNote: '미지원 (당해 공사 계약서·입찰공고문 수동 업로드 필수)',
        },
        {
          category: 'AGENCY_INTERNAL_RULE',
          label: 'LH 등 공기업·공공기관 자체 계약규정·내부지침',
          supported: false,
          coverageNote: '미지원 (발주기관 전자조달시스템 공인 규정 파일 수동 업로드 필수)',
        },
        {
          category: 'PRECEDENT_OR_INTERPRETATION',
          label: '대법원 판례·법제처 법령해석례 (target=prec, expc)',
          supported: true,
          coverageNote: '공개 판례 및 법령해석례 조회 지원 (비공개 하급심·기재부 개별 민원회신은 수동 첨부 필요)',
        },
      ],
      lastSuccessfulRetrievalAt: isMolegConfigured ? lastRetrievalTime : null,
      authRequirementText:
        '법제처 국가법령정보 공동활용(open.law.go.kr) 회원가입 및 Open API 사용 신청 승인 후 발급된 OC(이메일 ID) 서버 환경변수(LAW_GO_KR_OC) 등록 필요',
      historicalCoverageLimitations:
        '법률·시행령·시행규칙은 MST 기준 연혁 조문 조회가 가능하나, 일부 과거 행정규칙(구 계약예규)과 별표 HWP/PDF 첨부파일, 발주처 자체 내부지침(LH 공사계약일반조건 등)은 API만으로 완결 조회가 불가능하므로 미확보 시 반드시 "해당 시점 원문 미확보"로 표시됩니다.',
      lastFailureMessage: isMolegConfigured
        ? null
        : 'LAW_GO_KR_OC 서버 시크릿이 설정되지 않아 실시간 API 호출이 비활성화되어 있습니다 (가짜 API 성공 응답을 생성하지 않습니다).',
    },
    {
      connectorId: 'AGENCY_AUTHENTICATED_UPLOAD',
      name: '발주기관 공인 문서 및 계약문서 수동 등록소',
      provider: '내부 문서 검증 파이프라인 (SHA-256 해시 보존)',
      status: 'MANUAL_READY',
      statusLabel: '정상 가동 (수동 업로드·검증 활성)',
      availableCategories: [
        {
          category: 'CONTRACT_GENERAL_CONDITIONS',
          label: '공사계약일반조건·특수조건·입찰공고문',
          supported: true,
          coverageNote: 'PDF/DOCX/TXT 업로드 및 SHA-256 무결성 해시·페이지/절 앵커 보존',
        },
        {
          category: 'AGENCY_INTERNAL_RULE',
          label: 'LH·지방공기업 자체 계약규정 및 지침',
          supported: true,
          coverageNote: '발주처 배포 원문 파일 직접 등록 및 버전일 지정 지원',
        },
        {
          category: 'ADMINISTRATIVE_RULE',
          label: '과거 시점 계약예규·고시 공식 원문 파일',
          supported: true,
          coverageNote: 'API 미제공 구(舊) 예규 원문 직접 첨부 지원',
        },
      ],
      lastSuccessfulRetrievalAt: lastRetrievalTime,
      authRequirementText: '프로젝트 실무자(PROJECT_CONTRIBUTOR) 이상 역할 권한 필요',
      historicalCoverageLimitations:
        '스캔 상태가 불량하거나 텍스트 레이어가 없는 이미지 PDF는 자동으로 판독 불가(OCR/수동 입력 필요)로 분류되며, 페이지 번호가 없는 문서는 절·항 앵커로만 인용됩니다.',
      lastFailureMessage: null,
    },
    {
      connectorId: 'LAWNB_OPTIONAL',
      name: '로앤비(LAWnB) 엔터프라이즈 라이선스 커넥터 (선택 사항)',
      provider: 'Thomson Reuters Korea / LAWnB (공식 제휴 API 전용)',
      status: 'DISABLED_BY_LICENSE_POLICY',
      statusLabel: '비활성화됨 (라이선스·이용허락 미설정)',
      availableCategories: [
        {
          category: 'PRECEDENT_OR_INTERPRETATION',
          label: '상업용 판례·주석서·유권해석 DB',
          supported: false,
          coverageNote:
            '자동 크롤링·스크래핑 및 접근통제 우회 엄격 금지. 별도 엔터프라이즈 API 라이선스 계약 및 법무팀 승인 전까지 비활성 상태 유지',
        },
      ],
      lastSuccessfulRetrievalAt: null,
      authRequirementText:
        '로앤비 공식 B2B API 연동 라이선스 계약서, 자동화 재사용 허락 확인서 및 서버 전용 인증키(LAWNB_ENABLED=true, LAWNB_API_KEY) 구성 필수',
      historicalCoverageLimitations:
        '일반 웹 구독 계정만으로는 자동 수집·재가공이 약관상 허용되지 않으므로 시스템에서 웹 스크래핑을 일절 수행하지 않습니다.',
      lastFailureMessage: '조직 라이선스 정책에 따라 비활성화 상태입니다.',
    },
  ];
}
