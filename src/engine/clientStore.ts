/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ApplicabilityAssessment,
  ApplicabilityRule,
  AppUser,
  AuditEvent,
  ContractingRegimeStatus,
  ContractingRegimeValue,
  ContractorRole,
  DatePrecision,
  Document,
  DocumentCategory,
  EventConfirmationStatus,
  ExportRecord,
  Fact,
  GovernancePolicySettings,
  InstitutionCategory,
  LegalInstrument,
  LegalReviewConclusion,
  LongTermStructureType,
  Project,
  ProjectEvent,
  ProjectEventType,
  ProvisionVersion,
  ReviewDecision,
  SourceRecord,
  UserRole,
  VatTreatment,
  WorkspaceMode,
} from '../types/legalDomain.ts';
import {
  SEED_ASSESSMENTS,
  SEED_AUDIT_EVENTS,
  SEED_DOCUMENTS,
  SEED_EVENTS,
  SEED_EXPORT_RECORDS,
  SEED_FACTS,
  SEED_INSTRUMENTS,
  SEED_PROJECTS,
  SEED_PROVISION_VERSIONS,
  SEED_REVIEW_DECISIONS,
  SEED_RULES,
  SEED_SOURCE_RECORDS,
  SEED_USERS,
  SYNTHETIC_WARNING_LABEL,
} from '../data/seedData.ts';
import {
  applyLegalReviewDecision,
  authorizeProjectAccess,
  flagAssessmentsAffectedByAmendment,
  invalidateAssessmentsOnFactChange,
  runStageAHistoricalRetrieval,
  runStageBApplicabilityEvaluation,
  validateWorkspaceIsolation,
} from './applicabilityEngine.ts';
import { ingestDocumentAndExtractCandidates } from './documentIngestion.ts';
import { getConnectorStatuses, queryLawGoKrOpenApi, validateAllowlistedSourceUrl } from './lawGoKrConnector.ts';

export interface ClientDatabaseState {
  users: AppUser[];
  projects: Project[];
  events: ProjectEvent[];
  documents: Document[];
  facts: Fact[];
  sourceRecords: SourceRecord[];
  instruments: LegalInstrument[];
  provisionVersions: ProvisionVersion[];
  rules: ApplicabilityRule[];
  assessments: ApplicabilityAssessment[];
  reviewDecisions: ReviewDecision[];
  auditEvents: AuditEvent[];
  exportRecords: ExportRecord[];
  governancePolicy: GovernancePolicySettings;
  lastMolegRetrievalAt: string | null;
}

const STORAGE_KEY = 'public_construction_legal_review_state_v2';

export const DEFAULT_GOVERNANCE_POLICY: GovernancePolicySettings = {
  allowExternalAiContractProcessing: true,
  amendmentMonitoringMode: 'MANUAL_ON_DEMAND',
  schedulerConfigured: false,
  retentionDays: 1825,
  privateStorageEnforced: true,
};

function createInitialState(): ClientDatabaseState {
  return {
    users: [...SEED_USERS],
    projects: [...SEED_PROJECTS],
    events: [...SEED_EVENTS],
    documents: [...SEED_DOCUMENTS],
    facts: [...SEED_FACTS],
    sourceRecords: [...SEED_SOURCE_RECORDS],
    instruments: [...SEED_INSTRUMENTS],
    provisionVersions: [...SEED_PROVISION_VERSIONS],
    rules: [...SEED_RULES],
    assessments: [...SEED_ASSESSMENTS],
    reviewDecisions: [...SEED_REVIEW_DECISIONS],
    auditEvents: [...SEED_AUDIT_EVENTS],
    exportRecords: [...SEED_EXPORT_RECORDS],
    governancePolicy: { ...DEFAULT_GOVERNANCE_POLICY },
    lastMolegRetrievalAt: '2026-03-31T09:00:00+09:00',
  };
}

let memoryState: ClientDatabaseState | null = null;

export function getClientState(): ClientDatabaseState {
  if (memoryState) return memoryState;

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.projects)) {
          memoryState = parsed;
          return memoryState!;
        }
      }
    } catch {
      // Fallback
    }
  }

  memoryState = createInitialState();
  return memoryState;
}

export function saveClientState(state: ClientDatabaseState): void {
  memoryState = state;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Quota exceeded safe fallback
    }
  }
}

export function resetClientDemoWorkspace(): void {
  const initial = createInitialState();
  const current = getClientState();

  const prodProjects = current.projects.filter((p) => p.workspaceMode === WorkspaceMode.PRODUCTION);
  const prodProjectIds = new Set(prodProjects.map((p) => p.id));

  const merged: ClientDatabaseState = {
    users: current.users,
    projects: [
      ...prodProjects,
      ...initial.projects.filter((p) => p.workspaceMode === WorkspaceMode.DEMO),
    ],
    events: [
      ...current.events.filter((e) => prodProjectIds.has(e.projectId)),
      ...initial.events.filter((e) => e.workspaceMode === WorkspaceMode.DEMO),
    ],
    documents: [
      ...current.documents.filter((d) => prodProjectIds.has(d.projectId)),
      ...initial.documents.filter((d) => d.workspaceMode === WorkspaceMode.DEMO),
    ],
    facts: [
      ...current.facts.filter((f) => prodProjectIds.has(f.projectId)),
      ...initial.facts.filter((f) => f.workspaceMode === WorkspaceMode.DEMO),
    ],
    sourceRecords: [
      ...current.sourceRecords.filter((s) => s.workspaceMode === WorkspaceMode.PRODUCTION),
      ...initial.sourceRecords.filter((s) => s.workspaceMode === WorkspaceMode.DEMO),
    ],
    instruments: [
      ...current.instruments.filter((i) => i.workspaceMode === WorkspaceMode.PRODUCTION),
      ...initial.instruments.filter((i) => i.workspaceMode === WorkspaceMode.DEMO),
    ],
    provisionVersions: [
      ...current.provisionVersions.filter((pv) => pv.workspaceMode === WorkspaceMode.PRODUCTION),
      ...initial.provisionVersions.filter((pv) => pv.workspaceMode === WorkspaceMode.DEMO),
    ],
    rules: [
      ...current.rules.filter((r) => r.workspaceMode === WorkspaceMode.PRODUCTION),
      ...initial.rules.filter((r) => r.workspaceMode === WorkspaceMode.DEMO),
    ],
    assessments: [
      ...current.assessments.filter((a) => prodProjectIds.has(a.projectId)),
      ...initial.assessments.filter((a) => a.workspaceMode === WorkspaceMode.DEMO),
    ],
    reviewDecisions: [
      ...current.reviewDecisions.filter((rd) => prodProjectIds.has(rd.projectId)),
      ...initial.reviewDecisions.filter((rd) => rd.workspaceMode === WorkspaceMode.DEMO),
    ],
    auditEvents: [
      ...current.auditEvents.filter((ae) => ae.workspaceMode === WorkspaceMode.PRODUCTION),
      ...initial.auditEvents.filter((ae) => ae.workspaceMode === WorkspaceMode.DEMO),
    ],
    exportRecords: [
      ...current.exportRecords.filter((ex) => prodProjectIds.has(ex.projectId)),
      ...initial.exportRecords.filter((ex) => ex.workspaceMode === WorkspaceMode.DEMO),
    ],
    governancePolicy: current.governancePolicy,
    lastMolegRetrievalAt: current.lastMolegRetrievalAt,
  };

  saveClientState(merged);
}

function getKstNowIso(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).replace(' ', 'T') + '+09:00';
}

function resolveUser(actorId?: string): AppUser {
  const state = getClientState();
  const found = state.users.find((u) => u.id === actorId);
  return found || state.users[0];
}

export function handleClientBootstrap(actorId: string, workspaceMode: WorkspaceMode) {
  const user = resolveUser(actorId);
  const state = getClientState();

  const accessibleProjects = state.projects.filter((p) => {
    if (p.workspaceMode !== workspaceMode) return false;
    const check = authorizeProjectAccess(user, p, 'READ');
    return check.allowed;
  });

  const accessibleProjectIds = new Set(accessibleProjects.map((p) => p.id));

  return {
    currentUser: user,
    allUsers: state.users,
    workspaceMode,
    projects: accessibleProjects,
    events: state.events.filter(
      (e) => e.workspaceMode === workspaceMode && accessibleProjectIds.has(e.projectId)
    ),
    documents: state.documents.filter(
      (d) => d.workspaceMode === workspaceMode && accessibleProjectIds.has(d.projectId)
    ),
    facts: state.facts.filter(
      (f) => f.workspaceMode === workspaceMode && accessibleProjectIds.has(f.projectId)
    ),
    sourceRecords: state.sourceRecords.filter((s) => s.workspaceMode === workspaceMode),
    instruments: state.instruments.filter((i) => i.workspaceMode === workspaceMode),
    provisionVersions: state.provisionVersions.filter((pv) => pv.workspaceMode === workspaceMode),
    rules: state.rules.filter((r) => r.workspaceMode === workspaceMode),
    assessments: state.assessments.filter(
      (a) => a.workspaceMode === workspaceMode && accessibleProjectIds.has(a.projectId)
    ),
    reviewDecisions: state.reviewDecisions.filter(
      (rd) => rd.workspaceMode === workspaceMode && accessibleProjectIds.has(rd.projectId)
    ),
    auditEvents: state.auditEvents
      .filter((ae) => ae.workspaceMode === workspaceMode)
      .slice(0, 100),
    exportRecords: state.exportRecords.filter(
      (ex) => ex.workspaceMode === workspaceMode && accessibleProjectIds.has(ex.projectId)
    ),
    connectorStatuses: getConnectorStatuses(state.lastMolegRetrievalAt),
    governancePolicy: state.governancePolicy,
  };
}

export function handleClientProjectCreate(body: any, actorId: string) {
  const user = resolveUser(actorId);
  if (user.role === UserRole.READ_ONLY_EXECUTIVE) {
    throw new Error('권한 거부: 경영진 열람 전용 계정은 신규 프로젝트를 생성할 수 없습니다.');
  }

  const state = getClientState();
  const workspaceMode: WorkspaceMode =
    body.workspaceMode === WorkspaceMode.DEMO ? WorkspaceMode.DEMO : WorkspaceMode.PRODUCTION;
  const nowKst = getKstNowIso();
  const newId = `proj-${workspaceMode.toLowerCase()}-${Date.now()}`;

  const newProject: Project = {
    id: newId,
    projectCode: (body.projectCode || `PRJ-${Date.now().toString().slice(-4)}`).trim(),
    projectName: (body.projectName || '신규 공공건설공사 시점검토 프로젝트').trim(),
    workspaceMode,
    syntheticWarning: workspaceMode === WorkspaceMode.DEMO ? SYNTHETIC_WARNING_LABEL : undefined,
    contractingPrincipal: (body.contractingPrincipal || '발주처 미입력').trim(),
    institutionCategory: body.institutionCategory || InstitutionCategory.UNVERIFIED,
    procurementAgency: (body.procurementAgency || '자체발주 여부 확인 필요').trim(),
    contractAdministrator: (body.contractAdministrator || '').trim(),
    supervisingAuthority: (body.supervisingAuthority || '').trim(),
    projectLocation: (body.projectLocation || '').trim(),
    localGovernment: (body.localGovernment || '').trim(),
    constructionType: (body.constructionType || '일반토목·건축공사').trim(),
    constructionScope: (body.constructionScope || '').trim(),
    contractorRole: body.contractorRole || ContractorRole.MAIN_CONTRACTOR,
    contractMethod: (body.contractMethod || '종합심사낙찰제').trim(),
    contractStructure: (body.contractStructure || '장기계속계약').trim(),
    longTermStructureType: body.longTermStructureType || LongTermStructureType.LONG_TERM_CONTINUING,
    totalContractAmountKrw:
      typeof body.totalContractAmountKrw === 'number' ? body.totalContractAmountKrw : null,
    vatTreatment: body.vatTreatment || VatTreatment.VAT_INCLUDED,
    amendmentHistorySummary: (body.amendmentHistorySummary || '').trim(),
    governingLawInfo: (body.governingLawInfo || '').trim(),
    incorporatedDocuments: Array.isArray(body.incorporatedDocuments) ? body.incorporatedDocuments : [],
    contractingRegimeStatus: body.contractingRegimeStatus || ContractingRegimeStatus.UNRESOLVED,
    contractingRegimeValue: body.contractingRegimeValue || ContractingRegimeValue.UNRESOLVED,
    contractingRegimeVerificationNote:
      body.contractingRegimeVerificationNote ||
      '기관명 또는 조달청 관여 여부만으로 법제 체계를 단정하지 않으며, 근거 규정 및 편입 계약조건 확인 필요',
    contractManager: (body.contractManager || user.name).trim(),
    siteManager: (body.siteManager || '').trim(),
    legalReviewer: (body.legalReviewer || '김법무 수석변호사').trim(),
    researchCutoffDate: body.researchCutoffDate || '2026-10-21',
    selectedResearchCategories:
      Array.isArray(body.selectedResearchCategories) && body.selectedResearchCategories.length > 0
        ? body.selectedResearchCategories
        : ['NATIONAL_PUBLIC_CONTRACT', 'LOCAL_GOVERNMENT_CONTRACT', 'PROCUREMENT_NOTICE_CONDITIONS'],
    assignedUserIds: Array.from(new Set([user.id, 'user-legal-01', 'user-contrib-01'])),
    createdAt: nowKst,
    updatedAt: nowKst,
  };

  state.projects.unshift(newProject);
  saveClientState(state);
  return { project: newProject };
}

export function handleClientProjectUpdate(projectId: string, body: any, actorId: string) {
  const user = resolveUser(actorId);
  const state = getClientState();
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) throw new Error('프로젝트를 찾을 수 없습니다.');

  const auth = authorizeProjectAccess(user, project, 'WRITE');
  if (!auth.allowed) throw new Error(auth.errorKo || '권한이 없습니다.');

  const nowKst = getKstNowIso();
  Object.assign(project, body, { updatedAt: nowKst });
  saveClientState(state);
  return { project };
}

export function handleClientEventCreate(projectId: string, body: any, actorId: string) {
  const user = resolveUser(actorId);
  const state = getClientState();
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) throw new Error('프로젝트를 찾을 수 없습니다.');

  const auth = authorizeProjectAccess(user, project, 'WRITE');
  if (!auth.allowed) throw new Error(auth.errorKo || '권한이 없습니다.');

  const nowKst = getKstNowIso();
  const isConfirmed = body.confirmationStatus === EventConfirmationStatus.CONFIRMED;

  const newEvent: ProjectEvent = {
    id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    projectId: project.id,
    workspaceMode: project.workspaceMode,
    eventType: body.eventType || ProjectEventType.CUSTOM_EVENT,
    eventTitle: (body.eventTitle || '신규 공사 이벤트').trim(),
    eventDate: body.eventDate ? String(body.eventDate).trim() : null,
    datePrecision: body.eventDate ? body.datePrecision || DatePrecision.EXACT_DAY : DatePrecision.UNKNOWN,
    dateRangeEnd: body.dateRangeEnd || null,
    sourceDocumentId: body.sourceDocumentId || null,
    pageOrSectionRef: (body.pageOrSectionRef || '출처 미지정').trim(),
    confirmationStatus: body.confirmationStatus || EventConfirmationStatus.CANDIDATE_UNCONFIRMED,
    confirmedBy: isConfirmed ? user.name : null,
    confirmedAt: isConfirmed ? nowKst : null,
    notes: (body.notes || '').trim(),
    createdAt: nowKst,
    updatedAt: nowKst,
  };

  state.events.push(newEvent);
  saveClientState(state);
  return { event: newEvent };
}

export function handleClientDocumentUpload(projectId: string, body: any, actorId: string) {
  const user = resolveUser(actorId);
  const state = getClientState();
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) throw new Error('프로젝트를 찾을 수 없습니다.');

  const auth = authorizeProjectAccess(user, project, 'WRITE');
  if (!auth.allowed) throw new Error(auth.errorKo || '권한이 없습니다.');

  const result = ingestDocumentAndExtractCandidates({
    projectId: project.id,
    workspaceMode: project.workspaceMode,
    documentCategory: body.documentCategory || DocumentCategory.EXECUTED_CONTRACT,
    originalFilename: (body.originalFilename || '업로드_문서.txt').trim(),
    mimeType: body.mimeType || 'text/plain',
    fileSizeBytes: Number(body.fileSizeBytes) || (body.rawContentText || '').length,
    rawContentText: String(body.rawContentText || ''),
    hasStablePagination: Boolean(body.hasStablePagination),
    pageCount: body.hasStablePagination ? Number(body.pageCount) || 1 : null,
    uploaderId: user.id,
    uploaderName: user.name,
  });

  state.documents.unshift(result.document);
  state.facts.unshift(...result.candidateFacts);
  state.events.push(...result.candidateEvents);

  saveClientState(state);
  return result;
}

export function handleClientFactUpdate(projectId: string, factId: string, body: any, actorId: string) {
  const user = resolveUser(actorId);
  const state = getClientState();
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) throw new Error('프로젝트를 찾을 수 없습니다.');

  const auth = authorizeProjectAccess(user, project, 'WRITE');
  if (!auth.allowed) throw new Error(auth.errorKo || '권한이 없습니다.');

  const fact = state.facts.find((f) => f.id === factId);
  if (!fact) throw new Error('사실 항목을 찾을 수 없습니다.');

  const nowKst = getKstNowIso();
  if (body.status !== undefined) {
    fact.status = body.status;
    if (body.status === 'CONFIRMED') {
      fact.confirmedBy = user.name;
      fact.confirmedAt = nowKst;
    }
  }
  if (body.value !== undefined) {
    fact.value = body.value;
  }
  fact.updatedAt = nowKst;

  saveClientState(state);
  return { fact };
}

export function handleClientEvaluate(projectId: string, body: any, actorId: string) {
  const user = resolveUser(actorId);
  const state = getClientState();
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) throw new Error('프로젝트를 찾을 수 없습니다.');

  const auth = authorizeProjectAccess(user, project, 'WRITE');
  if (!auth.allowed) throw new Error(auth.errorKo || '권한이 없습니다.');

  const { eventId, provisionVersionId, ruleId } = body || {};
  const targetEvent = state.events.find((e) => e.id === eventId && e.projectId === projectId);
  const candidateProvision = state.provisionVersions.find((pv) => pv.id === provisionVersionId);

  if (!targetEvent || !candidateProvision) {
    throw new Error('검토 대상 공사 이벤트와 후보 법령 조문 버전을 모두 선택해야 합니다.');
  }

  const iso = validateWorkspaceIsolation(
    project.workspaceMode,
    candidateProvision.workspaceMode,
    candidateProvision.syntheticLabel
  );
  if (!iso.valid) {
    throw new Error(iso.errorKo || '워크스페이스 격리 위반');
  }

  const matchedRule: ApplicabilityRule =
    state.rules.find((r) => r.id === ruleId) ||
    state.rules.find((r) => r.provisionVersionId === candidateProvision.id) || {
      id: `rule-adhoc-${Date.now()}`,
      provisionVersionId: candidateProvision.id,
      workspaceMode: project.workspaceMode,
      ruleName: `${candidateProvision.officialDocumentTitle} ${candidateProvision.articleNumber}`,
      issueTitle: `${candidateProvision.articleTitle} (${targetEvent.eventTitle} 적용 검토)`,
      researchCategory: 'LOCAL_GOVERNMENT_CONTRACT',
      approvalStatus: 'VERIFIED_BY_HUMAN',
      approvedBy: user.name,
      approvedAt: getKstNowIso(),
      targetEventTypes: [targetEvent.eventType],
      requiredRegimes: [],
      excludedRegimes: [],
      minThresholdAmountKrw: null,
      maxThresholdAmountKrw: null,
      requiredLocationKeywords: [],
      effectiveDateTriggerType: 'EVENT_FACTUAL_TRIGGER_DATE',
      boundaryComparison: 'ON_OR_AFTER',
      referenceBoundaryDate:
        candidateProvision.provisionEffectiveDate ||
        candidateProvision.generalEffectiveDate ||
        '2025-01-01',
      hasTransitionalPreservationOfPriorRule: Boolean(
        candidateProvision.transitionalProvisionText &&
          candidateProvision.transitionalProvisionText.includes('종전의 규정')
      ),
      preservedPriorProvisionVersionId: candidateProvision.priorVersionId,
      transitionalConditionDescription: candidateProvision.transitionalProvisionText,
      requiresPrecedentOrInterpretation:
        candidateProvision.precedentOrInterpretationDependency.required,
    };

  const allProjectEvents = state.events.filter((e) => e.projectId === project.id);
  const confirmedFacts = state.facts.filter(
    (f) => f.projectId === project.id && f.status === 'CONFIRMED'
  );
  const priorProvision = candidateProvision.priorVersionId
    ? state.provisionVersions.find((pv) => pv.id === candidateProvision.priorVersionId) || null
    : null;

  const stageA = runStageAHistoricalRetrieval(
    state.provisionVersions.filter((pv) => pv.instrumentId === candidateProvision.instrumentId),
    allProjectEvents,
    targetEvent,
    project.researchCutoffDate
  );

  const assessment = runStageBApplicabilityEvaluation({
    project,
    targetEvent,
    allProjectEvents,
    confirmedFacts,
    candidateProvision,
    priorProvision,
    rule: matchedRule,
    assignedReviewer: project.legalReviewer,
  });

  assessment.stageARetrievalSummary = `${stageA.retrievalSummary} / ${assessment.stageARetrievalSummary}`;

  state.assessments.unshift(assessment);
  saveClientState(state);
  return { assessment };
}

export function handleClientReviewDecision(assessmentId: string, body: any, actorId: string) {
  const user = resolveUser(actorId);
  const state = getClientState();
  const assessment = state.assessments.find((a) => a.id === assessmentId);
  if (!assessment) throw new Error('시점검토 평가 항목을 찾을 수 없습니다.');

  const project = state.projects.find((p) => p.id === assessment.projectId);
  if (!project) throw new Error('프로젝트를 찾을 수 없습니다.');

  const auth = authorizeProjectAccess(user, project, 'LEGAL_APPROVE');
  if (!auth.allowed) throw new Error(auth.errorKo || '법무 권한이 없습니다.');

  const { decisionType, recordedConclusion, reasonText } = body || {};
  const { updatedAssessment, decisionRecord } = applyLegalReviewDecision(
    assessment,
    user,
    decisionType,
    recordedConclusion,
    reasonText
  );

  const idx = state.assessments.findIndex((a) => a.id === assessmentId);
  if (idx !== -1) {
    state.assessments[idx] = updatedAssessment;
  }
  state.reviewDecisions.unshift(decisionRecord);

  saveClientState(state);
  return { assessment: updatedAssessment, decision: decisionRecord };
}

export function handleClientAiAssist(projectId: string, question: string, actorId: string) {
  const state = getClientState();
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) throw new Error('프로젝트를 찾을 수 없습니다.');

  const events = state.events.filter((e) => e.projectId === projectId);
  const facts = state.facts.filter((f) => f.projectId === projectId);
  const assessments = state.assessments.filter((a) => a.projectId === projectId);

  const isDemo = project.workspaceMode === WorkspaceMode.DEMO;
  const banner = isDemo ? `[${SYNTHETIC_WARNING_LABEL}] ` : '';

  return {
    isSyntheticDemo: isDemo,
    syntheticWarning: isDemo ? SYNTHETIC_WARNING_LABEL : undefined,
    assistantReplyKo: `${banner}질문: "${question}"에 대한 시점검토 근거 분석 결과입니다.\n\n` +
      `1. 프로젝트 식별: ${project.projectName} (${project.projectCode})\n` +
      `2. 발주기관 및 계약제도: ${project.contractingPrincipal} / ${project.contractingRegimeValue} (${project.contractingRegimeStatus})\n` +
      `3. 확인된 주요 시점:\n` +
      events.slice(0, 3).map((e) => `   - [${e.eventType}] ${e.eventTitle} (${e.eventDate || '미상'})`).join('\n') + '\n\n' +
      `4. 법적용 검토 핵심 원칙:\n` +
      `   - 계약 체결 당시 시행 법령과 사실발생 당시 개정 법령의 부칙(경과조치)을 반드시 대조 검토해야 합니다.\n` +
      `   - 인용 조문 및 부칙의 원문 근거가 확보되기 전에는 '적용'으로 단정하지 않으며, 최종적인 효력 부여는 법무담당자의 날인(법무 검토 완료)이 필요합니다.\n\n` +
      `5. 공식 법령 원문 확인: 국가법령정보센터(open.law.go.kr)의 공포일자·시행일자·부칙 조문을 직접 대조하시기 바랍니다.`,
    citedProvisions: assessments.map((a) => a.issueTitle).slice(0, 3),
    citedEvents: events.map((e) => e.eventTitle).slice(0, 3),
    unresolvedIssues: assessments.filter((a) => a.status !== '법무 검토 완료').map((a) => a.unresolvedIssues).flat(),
    legalDisclaimer: '본 AI 질의응답은 법적 확정 효력이 없으며, 최종 판단은 사내 법무 수석변호사의 승인이 필요합니다.',
  };
}

export async function dispatchClientApi(
  url: string,
  options: RequestInit = {},
  actorId: string,
  workspaceMode: WorkspaceMode = WorkspaceMode.PRODUCTION
): Promise<any> {
  const method = (options.method || 'GET').toUpperCase();
  const parsedUrl = new URL(url, 'http://localhost');
  const pathname = parsedUrl.pathname;
  let body: any = {};
  if (options.body && typeof options.body === 'string') {
    try {
      body = JSON.parse(options.body);
    } catch {
      body = {};
    }
  }

  if (pathname === '/api/bootstrap') {
    const qMode = (parsedUrl.searchParams.get('workspaceMode') as WorkspaceMode) || workspaceMode;
    return handleClientBootstrap(actorId, qMode);
  }

  if (pathname === '/api/demo/reset' && method === 'POST') {
    resetClientDemoWorkspace();
    return { success: true, messageKo: '데모 워크스페이스가 초기 합성 픽스처 상태로 초기화되었습니다.' };
  }

  if (pathname === '/api/projects' && method === 'POST') {
    return handleClientProjectCreate(body, actorId);
  }

  const projMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (projMatch && (method === 'PUT' || method === 'PATCH')) {
    return handleClientProjectUpdate(projMatch[1], body, actorId);
  }

  const eventsMatch = pathname.match(/^\/api\/projects\/([^/]+)\/events$/);
  if (eventsMatch && method === 'POST') {
    return handleClientEventCreate(eventsMatch[1], body, actorId);
  }

  const eventUpdateMatch = pathname.match(/^\/api\/projects\/([^/]+)\/events\/([^/]+)$/);
  if (eventUpdateMatch && (method === 'PUT' || method === 'PATCH')) {
    const state = getClientState();
    const event = state.events.find((e) => e.id === eventUpdateMatch[2]);
    if (!event) throw new Error('사건을 찾을 수 없습니다.');
    Object.assign(event, body, { updatedAt: getKstNowIso() });
    saveClientState(state);
    return { event };
  }

  const docsMatch = pathname.match(/^\/api\/projects\/([^/]+)\/documents$/);
  if (docsMatch && method === 'POST') {
    return handleClientDocumentUpload(docsMatch[1], body, actorId);
  }

  const factMatch = pathname.match(/^\/api\/projects\/([^/]+)\/facts\/([^/]+)$/);
  if (factMatch && (method === 'PUT' || method === 'PATCH')) {
    return handleClientFactUpdate(factMatch[1], factMatch[2], body, actorId);
  }

  const evalMatch = pathname.match(/^\/api\/projects\/([^/]+)\/evaluate$/);
  if (evalMatch && method === 'POST') {
    return handleClientEvaluate(evalMatch[1], body, actorId);
  }

  const reviewMatch = pathname.match(/^\/api\/assessments\/([^/]+)\/review$/);
  if (reviewMatch && method === 'POST') {
    return handleClientReviewDecision(reviewMatch[1], body, actorId);
  }

  if (pathname === '/api/sources/manual' && method === 'POST') {
    const state = getClientState();
    const nowKst = getKstNowIso();
    const newSource: SourceRecord = {
      id: `src-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      officialSourceId: (body.officialSourceId || `MANUAL-ID-${Date.now()}`).trim(),
      workspaceMode: body.workspaceMode || WorkspaceMode.PRODUCTION,
      syntheticLabel: body.workspaceMode === WorkspaceMode.DEMO ? SYNTHETIC_WARNING_LABEL : undefined,
      connectorId: 'AGENCY_AUTHENTICATED_UPLOAD',
      sourceCategory: body.sourceCategory || 'ENFORCEMENT_DECREE',
      officialTitle: (body.officialDocumentTitle || '수동 업로드 법령·계약예규').trim(),
      issuingAuthority: (body.issuingAuthority || '소관부처').trim(),
      officialUrlOrFileRef: (body.officialUrlOrFileRef || '수동 업로드 공인 원문 파일').trim(),
      retrievedAt: nowKst,
      hasFullHistoricalText: Boolean(body.verbatimKoreanText && String(body.verbatimKoreanText).trim()),
      missingAttachments: Array.isArray(body.missingAttachments) ? body.missingAttachments : [],
    };
    state.sourceRecords.unshift(newSource);
    saveClientState(state);
    return { sourceRecord: newSource };
  }

  const exportMatch = pathname.match(/^\/api\/projects\/([^/]+)\/exports$/);
  if (exportMatch && method === 'POST') {
    const state = getClientState();
    const nowKst = getKstNowIso();
    const newExport: ExportRecord = {
      id: `exp-${Date.now()}`,
      projectId: exportMatch[1],
      workspaceMode: body.workspaceMode || WorkspaceMode.PRODUCTION,
      exportFormat: body.exportFormat || 'XLSX_MATRIX',
      selectedEventIds: body.selectedEventIds || [],
      researchCutoffDate: '2026-10-21',
      generatedBy: actorId,
      generatedAt: nowKst,
      approvalStatusBanner: body.approvalStatusBanner || '법무 검토 전',
      unresolvedIssueCount: Number(body.unresolvedIssueCount || 0),
    };
    state.exportRecords.unshift(newExport);
    saveClientState(state);
    return { exportRecord: newExport };
  }

  if (pathname === '/api/connectors/moleg/query' && method === 'POST') {
    return queryLawGoKrOpenApi({
      mode: body.mode === 'SERVICE' ? 'SERVICE' : 'SEARCH',
      target: body.target || 'law',
      query: body.query,
      mst: body.mst,
      id: body.id,
      efYd: body.efYd,
    });
  }

  if (pathname === '/api/governance/policy' && (method === 'PUT' || method === 'PATCH')) {
    const state = getClientState();
    state.governancePolicy = {
      ...state.governancePolicy,
      ...body,
      updatedAt: getKstNowIso(),
      updatedBy: actorId,
    };
    saveClientState(state);
    return { governancePolicy: state.governancePolicy };
  }

  const aiMatch = pathname.match(/^\/api\/projects\/([^/]+)\/ai-assist$/);
  if (aiMatch && method === 'POST') {
    return handleClientAiAssist(aiMatch[1], body.question || '', actorId);
  }

  throw new Error(`지원하지 않는 오프라인 요청 경로입니다: ${pathname}`);
}
