import React, { useMemo, useState } from 'react';
import {
  ApplicabilityAssessment,
  AppUser,
  AuditEvent,
  ConnectorStatusInfo,
  Document,
  GovernancePolicySettings,
  Project,
  ProjectEvent,
  ProvisionVersion,
  RESEARCH_CATEGORY_LABELS,
  SourceRecord,
  SOURCE_CATEGORY_LABELS,
  UserRole,
  WorkspaceMode,
} from '../types/legalDomain.ts';
import { StructuredLegalAssistResponse } from '../server/geminiService.ts';
import { SYNTHETIC_WARNING_LABEL } from '../data/seedData.ts';

/**
 * Computes word-level diff tokens between prior and later Korean statutory texts.
 * Clearly labeled as application-generated text diff (distinct from official amendment metadata).
 */
function computeWordDiff(oldText: string, newText: string): Array<{
  type: 'SAME' | 'ADDED' | 'REMOVED';
  token: string;
}> {
  const oldTokens = oldText.split(/(\s+)/);
  const newTokens = newText.split(/(\s+)/);
  const result: Array<{ type: 'SAME' | 'ADDED' | 'REMOVED'; token: string }> = [];

  let i = 0;
  let j = 0;
  while (i < oldTokens.length || j < newTokens.length) {
    if (i < oldTokens.length && j < newTokens.length && oldTokens[i] === newTokens[j]) {
      result.push({ type: 'SAME', token: oldTokens[i] });
      i++;
      j++;
    } else if (
      j + 1 < newTokens.length &&
      i < oldTokens.length &&
      oldTokens[i] === newTokens[j + 1]
    ) {
      result.push({ type: 'ADDED', token: newTokens[j] });
      j++;
    } else if (
      i + 1 < oldTokens.length &&
      j < newTokens.length &&
      oldTokens[i + 1] === newTokens[j]
    ) {
      result.push({ type: 'REMOVED', token: oldTokens[i] });
      i++;
    } else {
      if (i < oldTokens.length) {
        result.push({ type: 'REMOVED', token: oldTokens[i] });
        i++;
      }
      if (j < newTokens.length) {
        result.push({ type: 'ADDED', token: newTokens[j] });
        j++;
      }
    }
  }
  return result;
}

// ================= E. HISTORICAL COMPARISON SCREEN =================
export const HistoricalComparisonView: React.FC<{
  provisions: ProvisionVersion[];
  workspaceMode: WorkspaceMode;
  onOpenUploadModal: () => void;
}> = ({ provisions, workspaceMode, onOpenUploadModal }) => {
  const [priorId, setPriorId] = useState<string>(() => {
    const withPrior = provisions.find((p) => p.priorVersionId);
    return withPrior?.priorVersionId || provisions[0]?.id || '';
  });
  const [laterId, setLaterId] = useState<string>(() => {
    const withPrior = provisions.find((p) => p.priorVersionId);
    return withPrior?.id || provisions[1]?.id || provisions[0]?.id || '';
  });

  const priorPv = provisions.find((p) => p.id === priorId) || provisions[0];
  const laterPv = provisions.find((p) => p.id === laterId) || provisions[1] || provisions[0];

  const diffTokens = useMemo(() => {
    if (!priorPv || !laterPv) return [];
    const oldTxt = priorPv.isHistoricalTextMissing
      ? '[해당 시점 원문 미확보]'
      : priorPv.verbatimKoreanText;
    const newTxt = laterPv.isHistoricalTextMissing
      ? '[해당 시점 원문 미확보]'
      : laterPv.verbatimKoreanText;
    return computeWordDiff(oldTxt, newTxt);
  }, [priorPv, laterPv]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            E. 신·구 조문 및 부칙 시점 대비 (Historical Comparison)
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            검증된 종전 조문과 개정 조문의 원문·부칙을 좌우 대조하며, 공식 제·개정 메타데이터와 애플리케이션이 생성한 문구 차이 하이라이트를 명확히 구분합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenUploadModal}
          className="px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded whitespace-nowrap shrink-0"
        >
          연혁 조문 버전 추가 등록
        </button>
      </div>

      {workspaceMode === WorkspaceMode.DEMO && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900 font-medium">
          [{SYNTHETIC_WARNING_LABEL}] 아래 조문은 데모 시나리오 검증을 위한 합성 법령 픽스처입니다.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 border border-slate-200 rounded-lg">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            종전(Prior) 조문 버전 선택
          </label>
          <select
            value={priorPv?.id || ''}
            onChange={(e) => setPriorId(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded bg-white"
          >
            {provisions.map((p) => (
              <option key={p.id} value={p.id}>
                [{p.amendmentNumber}] {p.officialDocumentTitle} {p.articleNumber} (조문시행:{' '}
                {p.provisionEffectiveDate || p.generalEffectiveDate || '미상'})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            개정·후속(Later) 조문 버전 선택
          </label>
          <select
            value={laterPv?.id || ''}
            onChange={(e) => setLaterId(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded bg-white"
          >
            {provisions.map((p) => (
              <option key={p.id} value={p.id}>
                [{p.amendmentNumber}] {p.officialDocumentTitle} {p.articleNumber} (조문시행:{' '}
                {p.provisionEffectiveDate || p.generalEffectiveDate || '미상'})
              </option>
            ))}
          </select>
        </div>
      </div>

      {priorPv && laterPv && (
        <>
          {/* Side-by-side Official Verbatim Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[
              { label: '종전 조문 (Prior Version — 공식 수집 원문)', pv: priorPv },
              { label: '개정·후속 조문 (Later Version — 공식 수집 원문)', pv: laterPv },
            ].map(({ label, pv }) => (
              <div
                key={label}
                className="bg-white border border-slate-200 rounded-lg p-5 space-y-4"
              >
                <div className="pb-3 border-b border-slate-200">
                  <div className="text-xs font-medium text-slate-500">{label}</div>
                  <h3 className="text-sm font-semibold text-slate-900 mt-1">
                    {pv.officialDocumentTitle} {pv.articleNumber} ({pv.articleTitle})
                  </h3>
                  <div className="text-xs text-slate-600 font-mono mt-1.5">
                    <span>공포번호: {pv.amendmentNumber}</span>
                    <span className="mx-1.5">·</span>
                    <span>개정구분: {pv.amendmentType}</span>
                    <span className="mx-1.5">·</span>
                    <span>공식ID: {pv.officialMstOrVersionId}</span>
                  </div>
                  <div className="text-xs text-slate-700 font-mono mt-1">
                    <span>공포일: {pv.promulgationDate || '미상'}</span>
                    <span className="mx-1.5">·</span>
                    <span>일반시행일: {pv.generalEffectiveDate || '미상'}</span>
                    <span className="mx-1.5">·</span>
                    <span className="font-semibold text-slate-900">
                      조문별 시행일: {pv.provisionEffectiveDate || pv.generalEffectiveDate || '미상'}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-800 mb-1.5">
                    1. 본문 조문 원문 (Verbatim Text)
                  </div>
                  {pv.isHistoricalTextMissing ? (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800 font-medium">
                      ■ 해당 시점 원문 미확보 (현행 법령으로 대체 금지)
                    </div>
                  ) : (
                    <pre className="whitespace-pre-wrap text-xs leading-relaxed text-slate-900 bg-slate-50 p-3.5 border border-slate-200 rounded font-sans">
                      {pv.verbatimKoreanText}
                    </pre>
                  )}
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
                  <div>
                    <span className="font-semibold text-slate-800">2. 부칙 시행일 규정: </span>
                    <span className="text-slate-700">
                      {pv.supplementaryProvisionsText || '등록된 부칙 없음'}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-800">3. 부칙 적용례: </span>
                    <span className="text-slate-700">
                      {pv.applicationClauseText || '별도 적용례 없음'}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-800">4. 부칙 경과조치: </span>
                    <span className="text-slate-700 font-medium">
                      {pv.transitionalProvisionText || '별도 경과조치 없음'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Application-Generated Diff Panel */}
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  애플리케이션 생성 문구 차이 대조 (Application-Generated Text Diff)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  ※ 아래 하이라이트는 법제처 공식 신·구조문대비표 원문이 아니라, 수집된 두 조문 텍스트 간 어절 증감을 본 시스템이 자동 계산한 보조 표시입니다.
                </p>
              </div>
              <div className="text-xs text-slate-600 flex items-center gap-4">
                <span>
                  <del className="bg-rose-100 text-rose-900 px-1">종전 삭제 문구</del>
                </span>
                <span>
                  <ins className="bg-emerald-100 text-emerald-950 px-1 no-underline font-semibold">
                    개정 추가 문구
                  </ins>
                </span>
              </div>
            </div>
            <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded text-xs leading-7 text-slate-900">
              {diffTokens.map((tok, idx) => {
                if (tok.type === 'REMOVED') {
                  return (
                    <del key={idx} className="bg-rose-100 text-rose-900 px-0.5">
                      {tok.token}
                    </del>
                  );
                }
                if (tok.type === 'ADDED') {
                  return (
                    <ins
                      key={idx}
                      className="bg-emerald-100 text-emerald-950 font-semibold px-0.5 no-underline"
                    >
                      {tok.token}
                    </ins>
                  );
                }
                return <span key={idx}>{tok.token}</span>;
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ================= F. EVIDENCE VIEWER SCREEN =================
export const EvidenceViewerScreen: React.FC<{
  assessments: ApplicabilityAssessment[];
  provisions: ProvisionVersion[];
  sources: SourceRecord[];
  documents: Document[];
  events: ProjectEvent[];
  selectedAssessmentId: string | null;
  onSelectAssessment: (id: string) => void;
}> = ({
  assessments,
  provisions,
  sources,
  documents,
  events,
  selectedAssessmentId,
  onSelectAssessment,
}) => {
  const activeAssessment =
    assessments.find((a) => a.id === selectedAssessmentId) || assessments[0] || null;
  const activeProvision = activeAssessment
    ? provisions.find((p) => p.id === activeAssessment.provisionVersionId) || null
    : null;
  const activeSource = activeProvision
    ? sources.find((s) => s.id === activeProvision.sourceRecordId) || null
    : null;
  const activeEvent = activeAssessment
    ? events.find((e) => e.id === activeAssessment.eventId) || null
    : null;
  const activeDocument = activeEvent?.sourceDocumentId
    ? documents.find((d) => d.id === activeEvent.sourceDocumentId) || null
    : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            F. 원문 및 판단근거 대조 뷰어 (Evidence Viewer)
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            좌측에는 수집된 법령·계약문서 원문(Verbatim Source)을 그대로 표시하고, 우측에는 시점별 적용 검토 분석(Model/Rule Analysis)을 분리 배치합니다.
          </p>
        </div>
        <div className="min-w-[320px]">
          <select
            value={activeAssessment?.id || ''}
            onChange={(e) => onSelectAssessment(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded bg-white"
          >
            {assessments.map((a) => (
              <option key={a.id} value={a.id}>
                [{a.status}] {a.issueTitle}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!activeAssessment ? (
        <div className="p-8 bg-white border border-slate-200 rounded-lg text-center text-xs text-slate-500">
          선택된 프로젝트에 생성된 적용성 검토 항목이 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Left Panel: Verbatim Original Source & Document Anchor */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
            <div className="pb-3 border-b border-slate-200">
              <div className="text-xs font-semibold text-slate-500">
                원문 증거 패널 (수집된 원문 그대로 보존 — 임의 요약·변형 금지)
              </div>
              <h3 className="text-sm font-semibold text-slate-900 mt-1">
                {activeProvision?.officialDocumentTitle || '원문 미지정'}{' '}
                {activeProvision?.articleNumber || ''}
              </h3>
              <div className="text-xs text-slate-600 mt-1">
                <span>
                  법원 구분:{' '}
                  {activeProvision
                    ? SOURCE_CATEGORY_LABELS[activeProvision.sourceCategory]
                    : '-'}
                </span>
                <span className="mx-1.5">·</span>
                <span>발령기관: {activeProvision?.issuingAuthority || '-'}</span>
                <span className="mx-1.5">·</span>
                <span>공식ID: {activeProvision?.officialMstOrVersionId || '-'}</span>
              </div>
              <div className="text-xs font-mono text-slate-700 mt-1.5">
                <span>공포일: {activeProvision?.promulgationDate || '미상'}</span>
                <span className="mx-1.5">·</span>
                <span>일반시행일: {activeProvision?.generalEffectiveDate || '미상'}</span>
                <span className="mx-1.5">·</span>
                <span className="font-semibold text-slate-900">
                  조문시행일:{' '}
                  {activeProvision?.provisionEffectiveDate ||
                    activeProvision?.generalEffectiveDate ||
                    '미상'}
                </span>
              </div>
              <div className="text-[11px] font-mono text-slate-500 mt-1">
                원문 수집일시(Retrieval Timestamp — 시행일과 별개):{' '}
                {activeSource?.retrievedAt || '미상'} · 출처:{' '}
                {activeSource?.officialUrlOrFileRef || '-'}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-800 mb-1.5">
                조문 본문 원문 ({activeProvision?.articleNumber})
              </div>
              {activeProvision?.isHistoricalTextMissing ? (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded text-xs text-rose-900 font-semibold">
                  ■ 해당 시점 원문 미확보 — 당시 시행 원문을 수집할 수 없어 현행 법령으로 대체하지 않고 공란 보존합니다.
                </div>
              ) : (
                <pre className="whitespace-pre-wrap text-xs leading-relaxed text-slate-900 bg-slate-50 p-4 border border-slate-200 rounded font-sans">
                  {activeAssessment.verbatimSourceExcerpt}
                </pre>
              )}
            </div>

            {activeProvision && (
              <div className="space-y-2.5 pt-3 border-t border-slate-200 text-xs">
                <div>
                  <div className="font-semibold text-slate-800">부칙 (시행일 조항)</div>
                  <div className="text-slate-700 mt-0.5 bg-slate-50 p-2.5 border border-slate-200 rounded">
                    {activeProvision.supplementaryProvisionsText || '부칙 원문 없음'}
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-slate-800">적용례 및 경과조치 조항</div>
                  <div className="text-slate-700 mt-0.5 bg-slate-50 p-2.5 border border-slate-200 rounded">
                    {activeProvision.applicationClauseText}{' '}
                    {activeProvision.transitionalProvisionText}
                  </div>
                </div>
                {activeProvision.referencedAttachments.length > 0 && (
                  <div>
                    <div className="font-semibold text-slate-800">참조 별표·서식 상태</div>
                    {activeProvision.referencedAttachments.map((att, i) => (
                      <div
                        key={i}
                        className={`mt-1 p-2.5 border rounded ${
                          att.status === 'MISSING'
                            ? 'bg-amber-50 border-amber-200 text-amber-900'
                            : 'bg-slate-50 border-slate-200 text-slate-800'
                        }`}
                      >
                        <span className="font-semibold">
                          [{att.status === 'MISSING' ? '별표·서식 누락' : '확보 완료'}] {att.title}:
                        </span>{' '}
                        {att.contentOrReason}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Project Document Evidence Anchor */}
            <div className="pt-3 border-t border-slate-200 text-xs space-y-2">
              <div className="font-semibold text-slate-800">
                연결된 공사 이벤트 및 프로젝트 문서 앵커
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-1">
                <div>
                  <span className="font-medium text-slate-700">대상 공사 이벤트: </span>
                  <span className="text-slate-900 font-semibold">
                    {activeEvent?.eventTitle || '미지정'}
                  </span>{' '}
                  <span className="font-mono">
                    ({activeEvent?.eventDate || '일자 미상'} · 정밀도:{' '}
                    {activeEvent?.datePrecision || 'UNKNOWN'})
                  </span>
                </div>
                <div>
                  <span className="font-medium text-slate-700">근거 문서 및 위치 앵커: </span>
                  <span className="text-slate-900">
                    {activeDocument?.originalFilename || '연결 문서 없음'} —{' '}
                    {activeEvent?.pageOrSectionRef || '위치 미지정'}
                  </span>
                </div>
                {activeDocument && (
                  <div className="text-[11px] text-slate-600 pt-1">
                    문서 텍스트 발췌: "{activeDocument.rawContentText}"
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Panel: Separated Analysis, Stage A/B Reasoning & Unresolved Issues */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
            <div className="pb-3 border-b border-slate-200">
              <div className="text-xs font-semibold text-slate-500">
                적용성 분석 및 판단근거 패널 (원문과 분리된 규칙·AI 분석)
              </div>
              <h3 className="text-sm font-semibold text-slate-900 mt-1">
                {activeAssessment.issueTitle}
              </h3>
              <div className="text-xs text-slate-600 mt-1.5">
                <span>
                  검토 분야: {RESEARCH_CATEGORY_LABELS[activeAssessment.researchCategory]}
                </span>
                <span className="mx-1.5">·</span>
                <span>검토 상태: {activeAssessment.status}</span>
                {activeAssessment.legalReviewConclusion && (
                  <>
                    <span className="mx-1.5">·</span>
                    <span className="font-semibold text-emerald-800">
                      법무 최종 결론: {activeAssessment.legalReviewConclusion}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <div className="font-semibold text-slate-800 mb-1">
                  Stage A: 시점별 후보 버전 탐색 요약
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded text-slate-800">
                  {activeAssessment.stageARetrievalSummary}
                </div>
              </div>

              <div>
                <div className="font-semibold text-slate-800 mb-1">
                  Stage B: 8대 요건 결정론적 검토 내역
                </div>
                <div className="border border-slate-200 rounded divide-y divide-slate-200">
                  {[
                    ['규율 대상(Subject Matter)', activeAssessment.stageBEvaluation.subjectMatterMatch],
                    [
                      '발주처·조달대행 법제 체계',
                      activeAssessment.stageBEvaluation.institutionRegimeCheck,
                    ],
                    [
                      '공사·계약 구조(장기계속 등)',
                      activeAssessment.stageBEvaluation.projectContractTypeCheck,
                    ],
                    ['계약금액 기준(Threshold)', activeAssessment.stageBEvaluation.thresholdCheck],
                    [
                      '시행일 경계 비교(일반 vs 조문별)',
                      activeAssessment.stageBEvaluation.effectiveDateBoundaryCheck,
                    ],
                    [
                      '부칙 적용례·경과조치 검토',
                      activeAssessment.stageBEvaluation.applicationAndTransitionalCheck,
                    ],
                    [
                      '편입 계약조건 버전 정합성',
                      activeAssessment.stageBEvaluation.incorporatedConditionsCheck,
                    ],
                  ].map(([k, v]) => (
                    <div key={k} className="grid grid-cols-3 gap-2 p-2.5">
                      <div className="font-medium text-slate-700">{k}</div>
                      <div className="col-span-2 text-slate-900">{v}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="font-semibold text-slate-800 mb-1">
                  사실관계-조문 연결 판단 설명 (원문과 분리 표시)
                </div>
                <pre className="whitespace-pre-wrap text-xs leading-relaxed text-slate-800 bg-slate-50 p-3.5 border border-slate-200 rounded font-sans">
                  {activeAssessment.modelOrRuleAnalysisText}
                </pre>
              </div>

              <div>
                <div className="font-semibold text-slate-800 mb-1">
                  증거 완결성 지표 (수치형 AI 신뢰도 점수 미사용)
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-1.5">
                  <div className="font-medium text-slate-900">
                    {activeAssessment.evidenceCompleteness.summaryLabel}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-700">
                    <span>
                      {activeAssessment.evidenceCompleteness.hasConfirmedEventDate ? '■' : '□'} 기준 이벤트 일자 확정
                    </span>
                    <span>
                      {activeAssessment.evidenceCompleteness.hasVerifiedRegime ? '■' : '□'} 발주처 계약법제 검증 완료
                    </span>
                    <span>
                      {activeAssessment.evidenceCompleteness.hasVerbatimHistoricalText ? '■' : '□'} 당시 시행 원문 확보
                    </span>
                    <span>
                      {activeAssessment.evidenceCompleteness.hasCompleteAttachments ? '■' : '□'} 참조 별표·서식 완비
                    </span>
                    <span>
                      {activeAssessment.evidenceCompleteness.hasResolvedTransitionalClause ? '■' : '□'} 부칙 경과조치 확인
                    </span>
                    <span>
                      {activeAssessment.evidenceCompleteness.hasRequiredPrecedent ? '■' : '□'} 판례·유권해석 요건 충족
                    </span>
                  </div>
                </div>
              </div>

              {activeAssessment.unresolvedIssues.length > 0 && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded space-y-1">
                  <div className="font-semibold text-amber-950">
                    ▲ 미확인 사항 및 해석상 불확실성 ({activeAssessment.unresolvedIssues.length}건)
                  </div>
                  <ul className="list-disc pl-4 space-y-1 text-amber-900">
                    {activeAssessment.unresolvedIssues.map((issue, idx) => (
                      <li key={idx}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ================= I. AMENDMENT IMPACT WORKSPACE =================
export const AmendmentImpactWorkspace: React.FC<{
  projects: Project[];
  assessments: ApplicabilityAssessment[];
  provisions: ProvisionVersion[];
  governancePolicy: GovernancePolicySettings;
  onSelectAssessmentInViewer: (assessmentId: string) => void;
  onOpenUploadAmendmentModal: () => void;
}> = ({
  projects,
  assessments,
  provisions,
  governancePolicy,
  onSelectAssessmentInViewer,
  onOpenUploadAmendmentModal,
}) => {
  const impactedAssessments = assessments.filter(
    (a) => a.affectedByLaterAmendment || a.status === '재검토 필요'
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            I. 개정 영향 분석 및 재검토 워크스페이스 (Amendment Impact Workspace)
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            후속 법령 개정 또는 프로젝트 사실 변경으로 인해 재검토가 필요한 항목을 식별합니다. 이미 '법무 검토 완료'된 과거 판단 결론은 절대 자동으로 덮어쓰지 않고 보존합니다.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-600 font-mono">
            모니터링 방식:{' '}
            {governancePolicy.schedulerConfigured
              ? '서버 스케줄러 활성'
              : '수동 온디맨드 점검 (브라우저 종료 후 백그라운드 자동 감시 미수행 명시)'}
          </span>
          <button
            type="button"
            onClick={onOpenUploadAmendmentModal}
            className="px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded whitespace-nowrap shrink-0"
          >
            신규 개정 조문 등록 및 영향 점검
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-900">
            후속 개정 영향 감지 또는 선행 사실 변경으로 인한 재검토 대상 ({impactedAssessments.length}건)
          </h3>
        </div>
        {impactedAssessments.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            현재 후속 법령 개정이나 사실 변경으로 영향받은 검토 항목이 없습니다.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 text-xs">
            {impactedAssessments.map((a) => {
              const proj = projects.find((p) => p.id === a.projectId);
              const pv = provisions.find((p) => p.id === a.provisionVersionId);
              return (
                <div key={a.id} className="p-4 space-y-2 hover:bg-slate-50">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-slate-900">
                      [{proj?.projectCode || '-'}] {a.issueTitle}
                    </div>
                    <div className="text-xs text-slate-600">
                      <span>현재 보존된 검토 상태: {a.status}</span>
                      {a.legalReviewConclusion && (
                        <>
                          <span className="mx-1.5">·</span>
                          <span className="font-semibold text-emerald-800">
                            기승인 결론 보존됨: {a.legalReviewConclusion}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-slate-600">
                    기준 조문: {pv?.officialDocumentTitle} {pv?.articleNumber} (
                    {pv?.amendmentNumber}) · 기준일: {a.referenceDateUsed || '미상'}
                  </div>
                  {a.laterAmendmentNote && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded text-amber-900">
                      ▲ {a.laterAmendmentNote}
                    </div>
                  )}
                  {a.status === '재검토 필요' && a.unresolvedIssues.length > 0 && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-rose-900">
                      ■ {a.unresolvedIssues[0]}
                    </div>
                  )}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => onSelectAssessmentInViewer(a.id)}
                      className="text-xs font-medium text-slate-900 underline hover:text-slate-700"
                    >
                      원문 및 판단근거 뷰어에서 상세 검토 열기 →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ================= H. DATA CONNECTION, COVERAGE & GOVERNANCE SETTINGS =================
export const DataConnectionAndGovernanceScreen: React.FC<{
  connectors: ConnectorStatusInfo[];
  governancePolicy: GovernancePolicySettings;
  auditEvents: AuditEvent[];
  currentUser: AppUser;
  workspaceMode: WorkspaceMode;
  onTestMolegApi: (params: {
    mode: 'SEARCH' | 'SERVICE';
    target: 'law' | 'eflaw' | 'lsHistory' | 'admrul' | 'ordin' | 'licbyl';
    query?: string;
    simulatedFailureMode?: string;
  }) => Promise<unknown>;
  onUpdatePolicy: (updates: Partial<GovernancePolicySettings>) => Promise<void>;
}> = ({
  connectors,
  governancePolicy,
  auditEvents,
  currentUser,
  onTestMolegApi,
  onUpdatePolicy,
}) => {
  const [testQuery, setTestQuery] = useState('지방자치단체를 당사자로 하는 계약에 관한 법률 시행령');
  const [testTarget, setTestTarget] = useState<'law' | 'eflaw' | 'lsHistory' | 'admrul' | 'ordin'>('eflaw');
  const [simulatedFailure, setSimulatedFailure] = useState<string>('');
  const [apiOutcome, setApiOutcome] = useState<Record<string, unknown> | null>(null);
  const [testing, setTesting] = useState(false);

  const handleRunTest = async () => {
    setTesting(true);
    try {
      const res = await onTestMolegApi({
        mode: 'SEARCH',
        target: testTarget,
        query: testQuery,
        simulatedFailureMode: simulatedFailure || undefined,
      });
      setApiOutcome(res as Record<string, unknown>);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-slate-200">
        <h2 className="text-base font-semibold text-slate-900">
          H. 법령 데이터 연결·커버리지 및 보안 거버넌스 설정
        </h2>
        <p className="text-xs text-slate-600 mt-0.5">
          국가법령정보센터(open.law.go.kr) Open API 연결 상태, 원문 분야별 실제 제공 범위, 라이선스 정책(LAWnB), 외부 AI 데이터 처리 통제 및 변경 불가 감사 로그를 관리합니다.
        </p>
      </div>

      {/* Connector Status Cards */}
      <div className="space-y-4">
        {connectors.map((conn) => (
          <div
            key={conn.connectorId}
            className="bg-white border border-slate-200 rounded-lg p-5 space-y-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2 pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{conn.name}</h3>
                <div className="text-xs text-slate-500 mt-0.5">
                  제공 기관: {conn.provider} · 마지막 성공 수집 시각:{' '}
                  <span className="font-mono">
                    {conn.lastSuccessfulRetrievalAt || '기록 없음'}
                  </span>
                </div>
              </div>
              <div className="text-xs font-semibold">
                {conn.status === 'CONNECTED' && (
                  <span className="text-emerald-700">● {conn.statusLabel}</span>
                )}
                {conn.status === 'UNCONFIGURED_LIVE_API' && (
                  <span className="text-amber-800">▲ {conn.statusLabel}</span>
                )}
                {conn.status === 'MANUAL_READY' && (
                  <span className="text-slate-800">■ {conn.statusLabel}</span>
                )}
                {conn.status === 'DISABLED_BY_LICENSE_POLICY' && (
                  <span className="text-rose-800">○ {conn.statusLabel}</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {conn.availableCategories.map((cat) => (
                <div
                  key={cat.category}
                  className="p-2.5 bg-slate-50 border border-slate-200 rounded flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between font-medium text-slate-900">
                    <span>{cat.label}</span>
                    <span
                      className={
                        cat.supported ? 'text-emerald-800 font-semibold' : 'text-rose-800 font-semibold'
                      }
                    >
                      {cat.supported ? '지원 대상' : 'API 미제공 (수동 첨부 필수)'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1">{cat.coverageNote}</div>
                </div>
              ))}
            </div>

            <div className="text-xs space-y-1.5 pt-2 border-t border-slate-100 text-slate-700">
              <div>
                <span className="font-semibold text-slate-900">인증·승인 요건: </span>
                {conn.authRequirementText}
              </div>
              <div>
                <span className="font-semibold text-slate-900">연혁 커버리지 한계 명시: </span>
                {conn.historicalCoverageLimitations}
              </div>
              {conn.lastFailureMessage && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded text-amber-950 font-medium">
                  상태 안내: {conn.lastFailureMessage}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Live DRF Test & Failure Handling Verification Console */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-900">
          국가법령정보센터(open.law.go.kr DRF) 서버 연결 점검 및 오류 처리 검증
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">대상 서비스(target)</label>
            <select
              value={testTarget}
              onChange={(e) =>
                setTestTarget(e.target.value as 'law' | 'eflaw' | 'lsHistory' | 'admrul' | 'ordin')
              }
              className="w-full px-3 py-2 border border-slate-300 rounded bg-white font-mono"
            >
              <option value="eflaw">eflaw (시행일 기준 법령)</option>
              <option value="law">law (현행 법령)</option>
              <option value="lsHistory">lsHistory (법령 연혁)</option>
              <option value="admrul">admrul (행정규칙·계약예규)</option>
              <option value="ordin">ordin (자치법규·조례)</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block font-medium text-slate-700 mb-1">법령 검색어(query)</label>
            <input
              type="text"
              value={testQuery}
              onChange={(e) => setTestQuery(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              장애 대응 검증 모드 (선택)
            </label>
            <select
              value={simulatedFailure}
              onChange={(e) => setSimulatedFailure(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
            >
              <option value="">실제 서버 환경변수(LAW_GO_KR_OC) 기준 호출</option>
              <option value="TIMEOUT">시간초과(Timeout) 시뮬레이션</option>
              <option value="RATE_LIMIT">호출한도 초과(HTTP 429) 시뮬레이션</option>
              <option value="UNSUPPORTED_HISTORICAL_COVERAGE">과거 예규 연혁 미제공 시뮬레이션</option>
              <option value="MALFORMED_RESPONSE">손상된 응답(Malformed) 시뮬레이션</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={testing}
            onClick={handleRunTest}
            className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded"
          >
            {testing ? '점검 요청 중...' : '서버 DRF 커넥터 호출 및 재시도 점검'}
          </button>
        </div>

        {apiOutcome && (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded text-xs space-y-2">
            <div className="font-semibold text-slate-900">
              점검 결과: {String(apiOutcome.messageKo || '')} (수집시각:{' '}
              <span className="font-mono">{String(apiOutcome.retrievedAt || '')}</span>)
            </div>
            {Array.isArray(apiOutcome.actionableStepsKo) &&
              apiOutcome.actionableStepsKo.length > 0 && (
                <ul className="list-disc pl-4 space-y-1 text-slate-700">
                  {(apiOutcome.actionableStepsKo as string[]).map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ul>
              )}
          </div>
        )}
      </div>

      {/* Governance & Data Processing Policy */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-900">
          조직 보안·데이터 처리 정책 (Security & Data-Processing Governance)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded space-y-2">
            <div className="font-semibold text-slate-900">
              업로드 계약문서 외부 AI(Gemini) 전송 통제 정책
            </div>
            <p className="text-slate-600">
              비활성화(기본값) 시 업로드된 도급계약서·특수조건 원문을 외부 AI 모델로 전송하지 않으며, 결정론적 파서와 확정된 메타데이터만을 사용하여 검토합니다.
            </p>
            <div className="pt-1 flex items-center justify-between">
              <span className="font-medium text-slate-800">
                현재 상태:{' '}
                {governancePolicy.allowExternalAiContractProcessing
                  ? '외부 AI 계약문서 처리 허용됨'
                  : '메타데이터·수동 검토 전용 (원문 외부 전송 차단)'}
              </span>
              {currentUser.role === UserRole.ADMIN && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdatePolicy({
                      allowExternalAiContractProcessing:
                        !governancePolicy.allowExternalAiContractProcessing,
                    })
                  }
                  className="px-3 py-1.5 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded hover:bg-slate-100"
                >
                  정책 전환 (관리자 전용)
                </button>
              )}
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded space-y-2">
            <div className="font-semibold text-slate-900">
              비공개 문서 저장소 및 보존 연한 정책 (규제 인증 참칭 금지)
            </div>
            <p className="text-slate-600">
              모든 업로드 문서는 비공개(Private) 프로젝트 격리 영역에 SHA-256 해시와 함께 보관되며 기본 공개 공유를 제공하지 않습니다.
            </p>
            <div className="font-mono text-slate-800">
              설정된 보존 기간: {governancePolicy.retentionDays}일 (5년) · 감사 로그 일반 사용자 수정·삭제 잠금 적용됨
            </div>
          </div>
        </div>
      </div>

      {/* Immutable Audit Log */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="text-xs font-semibold text-slate-900">
            변경 불가 감사 로그 (Immutable Audit Trail — 사실 변경·원문 수집·규칙 승인·법무 결재·내보내기·권한 차단 기록)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="py-2.5 px-3 font-medium">기록 시각 (Asia/Seoul)</th>
                <th className="py-2.5 px-3 font-medium">유형</th>
                <th className="py-2.5 px-3 font-medium">수행자 (역할)</th>
                <th className="py-2.5 px-3 font-medium">대상 엔티티</th>
                <th className="py-2.5 px-3 font-medium">상세 내역</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {auditEvents.map((ae) => (
                <tr key={ae.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3 font-mono whitespace-nowrap text-slate-600">
                    {ae.createdAt}
                  </td>
                  <td className="py-2.5 px-3 font-mono whitespace-nowrap text-slate-800">
                    {ae.eventType}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap text-slate-800">
                    {ae.actorName} ({ae.actorRole})
                  </td>
                  <td className="py-2.5 px-3 font-mono whitespace-nowrap text-slate-600">
                    {ae.targetEntityType}:{ae.targetEntityId}
                  </td>
                  <td className="py-2.5 px-3 text-slate-900">{ae.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ================= SECTION 9: KOREAN LEGAL Q&A & AI ASSISTANCE =================
const PRESET_KOREAN_QUESTIONS = [
  '이 공사의 설계변경 시점에 검토해야 할 법령과 계약조건을 보여줘.',
  '계약 체결 후 개정된 규정이 진행 중인 공사에 적용되는지 부칙을 확인해줘.',
  '이 결론의 원문과 당시 시행 조문을 보여줘.',
  '현재 자료만으로 판단할 수 없는 항목을 정리해줘.',
];

export const LegalAiEvidenceAssistant: React.FC<{
  project: Project;
  onAskQuestion: (questionKo: string) => Promise<StructuredLegalAssistResponse>;
}> = ({ project, onAskQuestion }) => {
  const [questionKo, setQuestionKo] = useState(PRESET_KOREAN_QUESTIONS[0]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StructuredLegalAssistResponse | null>(null);

  const handleRunQuery = async (q: string) => {
    setQuestionKo(q);
    setLoading(true);
    try {
      const res = await onAskQuestion(q);
      setResult(res);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="pb-4 border-b border-slate-200">
        <h2 className="text-base font-semibold text-slate-900">
          증거 기반 법령 시점 질의응답 (Evidence-Based Legal Research Assistant)
        </h2>
        <p className="text-xs text-slate-600 mt-0.5">
          AI 모델의 내부 기억(Memory)이나 일반 웹 검색 스니펫으로 법률 질문을 추측 답변하지 않으며, 오직 확보된 법령 원문과 확정된 공사 사실관계만을 5개 필수 섹션으로 분리하여 제시합니다.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="text-xs font-semibold text-slate-700">자주 쓰는 시점검토 질의 (클릭 시 즉시 실행)</div>
        <div className="flex flex-wrap gap-2">
          {PRESET_KOREAN_QUESTIONS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => handleRunQuery(preset)}
              className="px-3 py-1.5 text-xs text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded transition-colors"
            >
              “{preset}”
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={questionKo}
            onChange={(e) => setQuestionKo(e.target.value)}
            placeholder="프로젝트 사실관계 및 수집된 법령 원문 범위 내에서 질문을 입력하십시오..."
            className="flex-1 px-3.5 py-2 text-xs border border-slate-300 rounded"
          />
          <button
            type="button"
            disabled={loading}
            onClick={() => handleRunQuery(questionKo)}
            className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded whitespace-nowrap shrink-0"
          >
            {loading ? '증거 대조 분석 중...' : '수집 증거 기반 답변 생성'}
          </button>
        </div>
      </div>

      {result && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-5 text-xs">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded text-slate-700 flex flex-wrap items-center justify-between gap-2">
            <span>{result.disclaimerKo}</span>
            <span className="font-mono text-[11px] text-slate-500">
              실행 모드: {result.modeUsed} ({result.modelId})
            </span>
          </div>

          {/* 1. 확인된 사실 */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-2">
              1. 확인된 사실 (Confirmed Project Facts)
            </h3>
            <ul className="list-disc pl-5 space-y-1 text-slate-800">
              {result.confirmedFacts.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>

          {/* 2. 관련 원문 */}
          <div className="pt-3 border-t border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">
              2. 관련 원문 (Verbatim Source Excerpts — AI 분석과 엄격 분리)
            </h3>
            <div className="space-y-3">
              {result.verbatimSources.map((src, i) => (
                <div
                  key={i}
                  className="p-3.5 bg-slate-50 border border-slate-200 rounded space-y-1.5"
                >
                  <div className="font-semibold text-slate-900">
                    {src.officialTitle} {src.articleOrSection}
                  </div>
                  <div className="font-mono text-[11px] text-slate-600">
                    {src.effectiveDateInfo} · 원문 대조 검증:{' '}
                    {src.citationVerified ? '일치 확인됨' : '원문 미확보'}
                  </div>
                  <pre className="whitespace-pre-wrap text-xs text-slate-900 font-sans pt-1">
                    {src.quotedExcerpt}
                  </pre>
                </div>
              ))}
            </div>
          </div>

          {/* 3. 적용 검토 */}
          <div className="pt-3 border-t border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">
              3. 적용 검토 (Applicability & Transitional Reasoning)
            </h3>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-800">
              {result.applicabilityReview.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>

          {/* 4. 추가 확인 사항 */}
          <div className="pt-3 border-t border-slate-200">
            <h3 className="text-sm font-semibold text-amber-950 mb-2">
              4. 추가 확인 사항 (Missing Evidence & Unresolved Issues)
            </h3>
            <ul className="list-disc pl-5 space-y-1 text-amber-900">
              {result.additionalChecksNeeded.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
            {result.focusedFollowUpQuestions.length > 0 && (
              <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded">
                <div className="font-semibold text-amber-950 mb-1">
                  검토 완결을 위한 집중 확인 질문:
                </div>
                <ul className="list-disc pl-4 space-y-1 text-amber-900">
                  {result.focusedFollowUpQuestions.map((fq, i) => (
                    <li key={i}>{fq}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* 5. 법무 검토 상태 */}
          <div className="pt-3 border-t border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">
              5. 법무 검토 상태 (Legal Review Status)
            </h3>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded font-medium text-slate-900">
              {result.legalReviewStatusSummary}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
