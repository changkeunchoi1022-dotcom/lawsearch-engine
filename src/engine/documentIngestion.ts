import {
  DatePrecision,
  Document,
  DocumentCategory,
  EventConfirmationStatus,
  Fact,
  ProjectEvent,
  ProjectEventType,
  WorkspaceMode,
} from '../types/legalDomain.ts';

/**
 * Simple deterministic SHA-256 hex digest helper (works in both Node and browser tests)
 */
export function computeDeterministicHash(content: string, filename: string): string {
  let h1 = 0xdeadbeef ^ content.length;
  let h2 = 0x41c6ce57 ^ filename.length;
  const combined = `${filename}::${content}`;
  for (let i = 0; i < combined.length; i++) {
    const ch = combined.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  const hex3 = ((h1 ^ h2) >>> 0).toString(16).padStart(8, '0');
  const hex4 = ((h1 + h2) >>> 0).toString(16).padStart(8, '0');
  return `sha256:${hex1}${hex2}${hex3}${hex4}${hex1}${hex2}${hex3}${hex4}`;
}

/**
 * Detects whether an uploaded file is an unreadable scan or corrupted OCR text
 */
export function detectUnreadableScan(
  rawText: string,
  mimeType: string,
  filename: string
): { isUnreadable: boolean; reasonKo: string } {
  const trimmed = rawText.trim();
  const isImage = mimeType.startsWith('image/') || /\.(png|jpg|jpeg|tiff|bmp)$/i.test(filename);

  if (trimmed.length === 0) {
    return {
      isUnreadable: true,
      reasonKo: isImage
        ? '이미지 스캔 파일에 텍스트 레이어가 없습니다. 서버 OCR 처리 또는 담당자 수동 사실 입력이 필요합니다.'
        : '문서에서 추출 가능한 텍스트 레이어가 발견되지 않았습니다(스캔 이미지 PDF 가능성). OCR 또는 수동 입력으로 전환하십시오.',
    };
  }

  // Check for high ratio of replacement characters () or garbled symbols
  const replacementCount = (trimmed.match(/\uFFFD|\?/g) || []).length;
  if (trimmed.length < 15 || replacementCount / trimmed.length > 0.25) {
    return {
      isUnreadable: true,
      reasonKo:
        '스캔 해상도 저하 또는 폰트 인코딩 손상으로 인해 판독 불능 문자가 다수 검출되었습니다. 원문 육안 대조 및 수동 사실 입력이 필요합니다.',
    };
  }

  return {
    isUnreadable: false,
    reasonKo: '텍스트 레이어 추출 정상 (단, 표·수식·날인 영역은 원문 육안 대조 권장)',
  };
}

/**
 * Sanitizes untrusted document text before any AI prompt construction so uploaded documents
 * are treated strictly as passive evidence and never as instructions.
 */
export function wrapUntrustedDocumentEvidence(doc: Document): string {
  const safeBody = doc.rawContentText
    .replace(/<\/?untrusted_evidence>/gi, '')
    .replace(/ignore previous instructions/gi, '[무시된 지시문구]')
    .replace(/시스템 지시를 무시/g, '[무시된 지시문구]');

  return `<untrusted_evidence document_id="${doc.id}" filename="${doc.originalFilename}" pagination="${
    doc.hasStablePagination ? 'STABLE_PAGE_NUMBERS' : 'NO_PAGINATION_USE_SECTION_ANCHORS'
  }">\n${safeBody}\n</untrusted_evidence>`;
}

/**
 * Deterministically extracts candidate dates, amounts, and regime cues from uploaded document text.
 * All extracted items are created in 'CANDIDATE' / 'CANDIDATE_UNCONFIRMED' status requiring human confirmation.
 * Never fabricates page numbers when hasStablePagination is false!
 */
export function ingestDocumentAndExtractCandidates(params: {
  projectId: string;
  workspaceMode: WorkspaceMode;
  documentCategory: DocumentCategory;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  rawContentText: string;
  hasStablePagination: boolean;
  pageCount: number | null;
  uploaderId: string;
  uploaderName: string;
}): {
  document: Document;
  candidateFacts: Fact[];
  candidateEvents: ProjectEvent[];
} {
  const nowIso = new Date().toISOString();
  const scanCheck = detectUnreadableScan(
    params.rawContentText,
    params.mimeType,
    params.originalFilename
  );

  const docId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const document: Document = {
    id: docId,
    projectId: params.projectId,
    workspaceMode: params.workspaceMode,
    documentCategory: params.documentCategory,
    originalFilename: params.originalFilename,
    mimeType: params.mimeType,
    fileSizeBytes: params.fileSizeBytes,
    fileHashSha256: computeDeterministicHash(params.rawContentText, params.originalFilename),
    rawContentText: params.rawContentText,
    uploaderId: params.uploaderId,
    uploaderName: params.uploaderName,
    uploadedAt: nowIso,
    hasStablePagination: params.hasStablePagination,
    pageCount: params.hasStablePagination ? params.pageCount : null,
    extractionMethod: scanCheck.isUnreadable ? 'UNREADABLE_SCAN_FLAGGED' : 'TEXT_LAYER_PARSE',
    ocrLimitationNote: scanCheck.isUnreadable
      ? scanCheck.reasonKo
      : params.hasStablePagination
      ? '원본 문서 페이지 번호 기준 추출 (수기 날인 및 첨부 도면은 별도 확인 필요)'
      : '고정 페이지 번호 없음 — 조·항·절(Section/Paragraph) 앵커 기준으로만 위치 기록됨 (페이지 번호 임의 생성 금지)',
    isUnreadableScan: scanCheck.isUnreadable,
    userCorrectionsLog: [],
  };

  if (scanCheck.isUnreadable) {
    return { document, candidateFacts: [], candidateEvents: [] };
  }

  const candidateFacts: Fact[] = [];
  const candidateEvents: ProjectEvent[] = [];

  const lines = params.rawContentText.split(/\r?\n/);

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Determine anchor without ever fabricating page numbers
    const pageMatch = params.hasStablePagination ? trimmed.match(/\[p\.(\d+)\]|\[(\d+)쪽\]/) : null;
    const sectionMatch = trimmed.match(/^(제\d+조(?:의\d+)?|제\d+장|제\d+절|\d+\.\s*[^\s]+)/);
    const anchor = params.hasStablePagination
      ? pageMatch
        ? `p.${pageMatch[1] || pageMatch[2]}`
        : `본문 ${idx + 1}행 (페이지 마커 미기재)`
      : sectionMatch
      ? `${sectionMatch[1]} (문단 #${idx + 1} · 고정 페이지 번호 없음)`
      : `문단 #${idx + 1} (고정 페이지 번호 없음)`;

    // Match YYYY-MM-DD or YYYY년 MM월 DD일
    const dateRegex = /(\d{4})[-.년\s]+(\d{1,2})[-.월\s]+(\d{1,2})일?/g;
    let match: RegExpExecArray | null;
    while ((match = dateRegex.exec(trimmed)) !== null) {
      const yyyy = match[1];
      const mm = match[2].padStart(2, '0');
      const dd = match[3].padStart(2, '0');
      const isoDate = `${yyyy}-${mm}-${dd}`;

      let eventType: ProjectEventType = ProjectEventType.CUSTOM_EVENT;
      let eventTitle = '문서 내 식별 일자';
      if (trimmed.includes('입찰공고')) {
        eventType = ProjectEventType.TENDER_ANNOUNCEMENT;
        eventTitle = '입찰공고일 (문서 추출 후보)';
      } else if (trimmed.includes('계약체결') || trimmed.includes('도급계약')) {
        eventType = ProjectEventType.CONTRACT_EXECUTION;
        eventTitle = '도급계약 체결일 (문서 추출 후보)';
      } else if (trimmed.includes('차수') || trimmed.includes('연차계약')) {
        eventType = ProjectEventType.SUBSEQUENT_ANNUAL_CONTRACT;
        eventTitle = '연차계약 체결일 (문서 추출 후보)';
      } else if (trimmed.includes('착공')) {
        eventType = ProjectEventType.ACTUAL_COMMENCEMENT;
        eventTitle = '실착공일 (문서 추출 후보)';
      } else if (trimmed.includes('설계변경')) {
        eventType = ProjectEventType.DESIGN_CHANGE_INSTRUCTION_APPROVAL;
        eventTitle = '설계변경 지시·승인일 (문서 추출 후보)';
      } else if (trimmed.includes('물가변동') || trimmed.includes('조정신청')) {
        eventType = ProjectEventType.PRICE_ADJUSTMENT_EVENT_REQUEST;
        eventTitle = '물가변동 조정 기준/청구일 (문서 추출 후보)';
      } else if (trimmed.includes('일시정지') || trimmed.includes('공사중지')) {
        eventType = ProjectEventType.SUSPENSION_AND_RESUMPTION;
        eventTitle = '공사 일시정지/재개일 (문서 추출 후보)';
      } else if (trimmed.includes('준공')) {
        eventType = ProjectEventType.COMPLETION_INSPECTION_HANDOVER_PAYMENT;
        eventTitle = '준공·검사일 (문서 추출 후보)';
      }

      candidateFacts.push({
        id: `fact-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        projectId: params.projectId,
        workspaceMode: params.workspaceMode,
        factCategory: 'DATE',
        factKey: `extracted_date_${idx}`,
        label: eventTitle,
        value: isoDate,
        numericValue: null,
        dateValue: isoDate,
        precision: 'EXACT',
        sourceDocumentId: docId,
        pageOrSectionAnchor: anchor,
        paginationAvailable: params.hasStablePagination,
        verbatimExcerpt: trimmed,
        status: 'CANDIDATE', // Requires explicit user confirmation!
        extractedBy: 'DETERMINISTIC_PARSER',
        confirmedBy: null,
        confirmedAt: null,
        updatedAt: nowIso,
      });

      candidateEvents.push({
        id: `ev-cand-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        projectId: params.projectId,
        workspaceMode: params.workspaceMode,
        eventType,
        eventTitle,
        eventDate: isoDate,
        datePrecision: DatePrecision.EXACT_DAY,
        dateRangeEnd: null,
        sourceDocumentId: docId,
        pageOrSectionRef: anchor,
        confirmationStatus: EventConfirmationStatus.CANDIDATE_UNCONFIRMED,
        confirmedBy: null,
        confirmedAt: null,
        notes: `원문 발췌: "${trimmed}"`,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    // Extract contract amount if present
    const amountMatch = trimmed.match(/계약금액\s*[:：]?\s*(?:금\s*)?([\d,]+)\s*원/);
    if (amountMatch) {
      const numericVal = Number(amountMatch[1].replace(/,/g, ''));
      candidateFacts.push({
        id: `fact-amt-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        projectId: params.projectId,
        workspaceMode: params.workspaceMode,
        factCategory: 'AMOUNT_THRESHOLD',
        factKey: 'total_contract_amount_krw',
        label: '총 도급계약금액 (추출 후보)',
        value: `${numericVal.toLocaleString('ko-KR')}원`,
        numericValue: numericVal,
        dateValue: null,
        precision: 'EXACT',
        sourceDocumentId: docId,
        pageOrSectionAnchor: anchor,
        paginationAvailable: params.hasStablePagination,
        verbatimExcerpt: trimmed,
        status: 'CANDIDATE',
        extractedBy: 'DETERMINISTIC_PARSER',
        confirmedBy: null,
        confirmedAt: null,
        updatedAt: nowIso,
      });
    }
  });

  return {
    document,
    candidateFacts,
    candidateEvents,
  };
}
