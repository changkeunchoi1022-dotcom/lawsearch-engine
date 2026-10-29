import { describe, expect, it } from 'vitest';
import {
  applyLegalReviewDecision,
  authorizeProjectAccess,
  flagAssessmentsAffectedByAmendment,
  invalidateAssessmentsOnFactChange,
  runStageAHistoricalRetrieval,
  runStageBApplicabilityEvaluation,
  validateWorkspaceIsolation,
  verifyAiCitationsAgainstEvidence,
} from '../applicabilityEngine.ts';
import { queryLawGoKrOpenApi, validateAllowlistedSourceUrl } from '../lawGoKrConnector.ts';
import {
  ApplicabilityRule,
  AppUser,
  ContractingRegimeStatus,
  ContractingRegimeValue,
  ContractorRole,
  DatePrecision,
  EventConfirmationStatus,
  InstitutionCategory,
  LongTermStructureType,
  Project,
  ProjectEvent,
  ProjectEventType,
  ProvisionVersion,
  UserRole,
  VatTreatment,
  WorkspaceMode,
} from '../../types/legalDomain.ts';
import { SYNTHETIC_WARNING_LABEL } from '../../data/seedData.ts';

function createSyntheticProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'test-proj-01',
    projectCode: 'SYNTH-PRJ-001',
    projectName: '[가상 테스트] 공공건설 시점검토 검증 프로젝트',
    workspaceMode: WorkspaceMode.DEMO,
    syntheticWarning: SYNTHETIC_WARNING_LABEL,
    contractingPrincipal: '가람시청 (가상 지방자치단체)',
    institutionCategory: InstitutionCategory.LOCAL_GOVERNMENT,
    procurementAgency: '자체발주',
    contractAdministrator: '가람시 회계과',
    supervisingAuthority: '가람도청',
    projectLocation: '가람도 가람시',
    localGovernment: '가람시',
    constructionType: '토목공사',
    constructionScope: '정수장 증설',
    contractorRole: ContractorRole.MAIN_CONTRACTOR,
    contractMethod: '종합심사낙찰제',
    contractStructure: '장기계속계약',
    longTermStructureType: LongTermStructureType.LONG_TERM_CONTINUING,
    totalContractAmountKrw: 30000000000,
    vatTreatment: VatTreatment.VAT_INCLUDED,
    amendmentHistorySummary: '',
    governingLawInfo: SYNTHETIC_WARNING_LABEL,
    incorporatedDocuments: [],
    contractingRegimeStatus: ContractingRegimeStatus.VERIFIED,
    contractingRegimeValue: ContractingRegimeValue.LOCAL_CONTRACT_ACT,
    contractingRegimeVerificationNote: SYNTHETIC_WARNING_LABEL,
    siteManager: '김현장',
    contractManager: '박공무',
    legalReviewer: '이법무',
    researchCutoffDate: '2026-10-21',
    selectedResearchCategories: ['LOCAL_GOVERNMENT_CONTRACT'],
    assignedUserIds: ['u-contrib', 'u-legal'],
    createdAt: '2026-10-01T00:00:00+09:00',
    updatedAt: '2026-10-01T00:00:00+09:00',
    ...overrides,
  };
}

function createSyntheticProvision(overrides: Partial<ProvisionVersion> = {}): ProvisionVersion {
  return {
    id: 'synth-pv-01',
    instrumentId: 'synth-inst-01',
    sourceRecordId: 'synth-src-01',
    officialMstOrVersionId: 'SYNTH-MST-01',
    workspaceMode: WorkspaceMode.DEMO,
    syntheticLabel: SYNTHETIC_WARNING_LABEL,
    officialDocumentTitle: '[가상 법령] 공공건설공사 계약특례규정',
    sourceCategory: 'ENFORCEMENT_DECREE',
    issuingAuthority: '가상 행정부',
    articleNumber: '제10조제1항',
    articleTitle: '[가상 조문] 일반 시행일 기준 적용 조항',
    promulgationDate: '2024-01-10',
    generalEffectiveDate: '2024-04-01',
    provisionEffectiveDate: null,
    validUntilDate: null,
    amendmentType: '일부개정',
    amendmentNumber: '가상령 제100호',
    verbatimKoreanText:
      '[가상 예시 — 법률 판단에 사용 금지] 제10조(계약금액 조정) ① 발주기관은 물가변동 요건 충족 시 계약금액을 조정한다.',
    isHistoricalTextMissing: false,
    supplementaryProvisionsText: '부칙 제1조(시행일) 이 영은 2024년 4월 1일부터 시행한다.',
    applicationClauseText: '',
    transitionalProvisionText: '',
    referencedAttachments: [],
    precedentOrInterpretationDependency: {
      required: false,
      description: '',
      authoritySourceRetrieved: true,
    },
    priorVersionId: null,
    ...overrides,
  };
}

function createSyntheticRule(overrides: Partial<ApplicabilityRule> = {}): ApplicabilityRule {
  return {
    id: 'synth-rule-01',
    provisionVersionId: 'synth-pv-01',
    workspaceMode: WorkspaceMode.DEMO,
    ruleName: '[가상 규칙] 기본 시행일 검증 규칙',
    issueTitle: '[가상 쟁점] 시행일 기준 적용 여부',
    researchCategory: 'LOCAL_GOVERNMENT_CONTRACT',
    approvalStatus: 'VERIFIED_BY_HUMAN',
    approvedBy: '이법무',
    approvedAt: '2026-10-01T00:00:00+09:00',
    targetEventTypes: [ProjectEventType.CONTRACT_EXECUTION],
    requiredRegimes: [ContractingRegimeValue.LOCAL_CONTRACT_ACT],
    excludedRegimes: [],
    minThresholdAmountKrw: null,
    maxThresholdAmountKrw: null,
    requiredLocationKeywords: [],
    effectiveDateTriggerType: 'CONTRACT_EXECUTION_DATE',
    boundaryComparison: 'ON_OR_AFTER',
    referenceBoundaryDate: '2024-04-01',
    hasTransitionalPreservationOfPriorRule: false,
    preservedPriorProvisionVersionId: null,
    transitionalConditionDescription: '',
    requiresPrecedentOrInterpretation: false,
    ...overrides,
  };
}

function createSyntheticEvent(overrides: Partial<ProjectEvent> = {}): ProjectEvent {
  return {
    id: 'synth-ev-contract',
    projectId: 'test-proj-01',
    workspaceMode: WorkspaceMode.DEMO,
    eventType: ProjectEventType.CONTRACT_EXECUTION,
    eventTitle: '[가상] 도급계약 체결',
    eventDate: '2024-05-01',
    datePrecision: DatePrecision.EXACT_DAY,
    dateRangeEnd: null,
    sourceDocumentId: 'doc-1',
    pageOrSectionRef: 'p.1',
    confirmationStatus: EventConfirmationStatus.CONFIRMED,
    confirmedBy: '박공무',
    confirmedAt: '2026-10-01T00:00:00+09:00',
    notes: SYNTHETIC_WARNING_LABEL,
    createdAt: '2026-10-01T00:00:00+09:00',
    updatedAt: '2026-10-01T00:00:00+09:00',
    ...overrides,
  };
}

describe('공공공사 법령 시점검토 — 16대 필수 인수 테스트 (Acceptance Tests)', () => {
  it('1. 일반 시행일(General Effective Date)이 있는 규정의 시점 판정', () => {
    const project = createSyntheticProject();
    const provision = createSyntheticProvision({ generalEffectiveDate: '2024-04-01', provisionEffectiveDate: null });
    const rule = createSyntheticRule({ referenceBoundaryDate: '2024-04-01' });
    const contractEvent = createSyntheticEvent({ eventDate: '2024-05-10' });

    const stageA = runStageAHistoricalRetrieval([provision], [contractEvent], contractEvent, '2026-10-21');
    expect(stageA.candidateVersions).toHaveLength(1);

    const assessment = runStageBApplicabilityEvaluation({
      project,
      targetEvent: contractEvent,
      allProjectEvents: [contractEvent],
      confirmedFacts: [],
      candidateProvision: provision,
      rule,
    });

    expect(assessment.status).toBe('적용 근거 확인');
    expect(assessment.syntheticLabel).toBe(SYNTHETIC_WARNING_LABEL);
  });

  it('2. 단일 개정 법령 내 일반 시행일과 조문별 개별 시행일(Provision-Specific Effective Date)이 다른 경우 구별 판정', () => {
    const project = createSyntheticProject();
    // 일반 시행일은 2025-03-01이나, 제19조제2항 개별 시행일은 2025-07-01인 경우
    const provision = createSyntheticProvision({
      articleNumber: '제19조제2항',
      generalEffectiveDate: '2025-03-01',
      provisionEffectiveDate: '2025-07-01',
    });
    const rule = createSyntheticRule({
      effectiveDateTriggerType: 'CONTRACT_EXECUTION_DATE',
      referenceBoundaryDate: '2025-07-01',
    });
    // 계약일이 2025-05-01이면 일반 시행일 이후이지만 조문별 개별 시행일(2025-07-01) 이전이므로 비적용되어야 함
    const contractEvent = createSyntheticEvent({ eventDate: '2025-05-01' });

    const assessment = runStageBApplicabilityEvaluation({
      project,
      targetEvent: contractEvent,
      allProjectEvents: [contractEvent],
      confirmedFacts: [],
      candidateProvision: provision,
      rule,
    });

    expect(assessment.status).toBe('비적용 근거 확인');
    expect(assessment.stageBEvaluation.effectiveDateBoundaryCheck).toContain('일반 시행일은 2025-03-01이나');
    expect(assessment.stageBEvaluation.effectiveDateBoundaryCheck).toContain('개별 시행일은 2025-07-01');
  });

  it('3. 부칙 경과조치(Transitional Clause)에 의해 적격 종전 계약에 구법이 보존되는 경우 신법 비적용 판정', () => {
    const project = createSyntheticProject();
    const priorProvision = createSyntheticProvision({
      id: 'synth-pv-old',
      amendmentNumber: '가상령 제100호(구법)',
      generalEffectiveDate: '2023-01-01',
    });
    const newProvision = createSyntheticProvision({
      id: 'synth-pv-new',
      amendmentNumber: '가상령 제200호(신법)',
      generalEffectiveDate: '2025-01-01',
      provisionEffectiveDate: '2025-04-01',
      priorVersionId: 'synth-pv-old',
    });
    const rule = createSyntheticRule({
      provisionVersionId: 'synth-pv-new',
      effectiveDateTriggerType: 'EVENT_FACTUAL_TRIGGER_DATE',
      referenceBoundaryDate: '2025-04-01',
      hasTransitionalPreservationOfPriorRule: true,
      preservedPriorProvisionVersionId: 'synth-pv-old',
      transitionalConditionDescription: '시행일(2025-04-01) 전 입찰공고·계약체결 공사는 종전 규정에 따른다',
    });

    const tenderEvent = createSyntheticEvent({
      id: 'ev-tender',
      eventType: ProjectEventType.TENDER_ANNOUNCEMENT,
      eventTitle: '입찰공고',
      eventDate: '2024-02-01',
    });
    const designChangeEvent = createSyntheticEvent({
      id: 'ev-design',
      eventType: ProjectEventType.DESIGN_CHANGE_INSTRUCTION_APPROVAL,
      eventTitle: '설계변경 지시',
      eventDate: '2025-08-15', // 신법 시행일 이후에 발생했으나 입찰공고가 2024-02-01임
    });

    const assessment = runStageBApplicabilityEvaluation({
      project,
      targetEvent: designChangeEvent,
      allProjectEvents: [tenderEvent, designChangeEvent],
      confirmedFacts: [],
      candidateProvision: newProvision,
      priorProvision,
      rule,
    });

    // 신법(synth-pv-new)은 부칙 경과조치로 인해 비적용되어야 함
    expect(assessment.status).toBe('비적용 근거 확인');
    expect(assessment.stageBEvaluation.applicationAndTransitionalCheck).toContain('가상령 제100호(구법)');
  });

  it('4. 계약 체결 이후 제·개정된 법령이 후속 시공행위(Later Construction Activity)를 트리거로 적용되는 경우', () => {
    const project = createSyntheticProject();
    const safetyProvision = createSyntheticProvision({
      articleNumber: '제35조',
      generalEffectiveDate: '2025-06-01',
      provisionEffectiveDate: '2025-06-01',
    });
    const safetyRule = createSyntheticRule({
      effectiveDateTriggerType: 'EVENT_FACTUAL_TRIGGER_DATE',
      referenceBoundaryDate: '2025-06-01',
      hasTransitionalPreservationOfPriorRule: false,
    });
    const contractEvent = createSyntheticEvent({
      id: 'ev-c',
      eventType: ProjectEventType.CONTRACT_EXECUTION,
      eventDate: '2023-10-01',
    });
    const workEvent = createSyntheticEvent({
      id: 'ev-w',
      eventType: ProjectEventType.WORK_ACTIVITY_OR_VIOLATION,
      eventTitle: '터널 굴착 발파 작업',
      eventDate: '2025-07-20',
    });

    const assessment = runStageBApplicabilityEvaluation({
      project,
      targetEvent: workEvent,
      allProjectEvents: [contractEvent, workEvent],
      confirmedFacts: [],
      candidateProvision: safetyProvision,
      rule: safetyRule,
    });

    expect(assessment.status).toBe('적용 근거 확인');
    expect(assessment.referenceDateUsed).toBe('2025-07-20');
  });

  it('5. 트리거 일자가 시행일 경계(Effective-Date Boundary) 당일과 정확히 일치하는 경우 판정', () => {
    const project = createSyntheticProject();
    const provision = createSyntheticProvision({
      generalEffectiveDate: '2025-09-01',
      provisionEffectiveDate: '2025-09-01',
    });
    const onOrAfterRule = createSyntheticRule({
      effectiveDateTriggerType: 'EVENT_FACTUAL_TRIGGER_DATE',
      boundaryComparison: 'ON_OR_AFTER',
      referenceBoundaryDate: '2025-09-01',
    });
    const strictlyAfterRule = createSyntheticRule({
      effectiveDateTriggerType: 'EVENT_FACTUAL_TRIGGER_DATE',
      boundaryComparison: 'STRICTLY_AFTER',
      referenceBoundaryDate: '2025-09-01',
    });
    const boundaryEvent = createSyntheticEvent({
      eventType: ProjectEventType.WORK_ACTIVITY_OR_VIOLATION,
      eventDate: '2025-09-01',
    });

    const resOnOrAfter = runStageBApplicabilityEvaluation({
      project,
      targetEvent: boundaryEvent,
      allProjectEvents: [boundaryEvent],
      confirmedFacts: [],
      candidateProvision: provision,
      rule: onOrAfterRule,
    });
    expect(resOnOrAfter.status).toBe('적용 근거 확인');

    const resStrictlyAfter = runStageBApplicabilityEvaluation({
      project,
      targetEvent: boundaryEvent,
      allProjectEvents: [boundaryEvent],
      confirmedFacts: [],
      candidateProvision: provision,
      rule: strictlyAfterRule,
    });
    expect(resStrictlyAfter.status).toBe('비적용 근거 확인');
  });

  it('6. 계약일 누락 또는 이벤트 일자 불확실(UNKNOWN/MONTH_ONLY) 시 임의 추정 금지 및 추가 사실 확인 필요 판정', () => {
    const project = createSyntheticProject();
    const provision = createSyntheticProvision();
    const rule = createSyntheticRule({ effectiveDateTriggerType: 'EVENT_FACTUAL_TRIGGER_DATE' });
    const unknownDateEvent = createSyntheticEvent({
      eventDate: null,
      datePrecision: DatePrecision.UNKNOWN,
      confirmationStatus: EventConfirmationStatus.UNKNOWN,
    });

    const assessment = runStageBApplicabilityEvaluation({
      project,
      targetEvent: unknownDateEvent,
      allProjectEvents: [unknownDateEvent],
      confirmedFacts: [],
      candidateProvision: provision,
      rule,
    });

    expect(assessment.status).toBe('추가 사실 확인 필요');
    expect(assessment.unresolvedIssues.length).toBeGreaterThan(0);
  });

  it('7. LH 등 공공기관의 계약 법제 체계가 미해결(UNRESOLVED)인 경우 국가계약법 자동 단정 차단', () => {
    const lhProject = createSyntheticProject({
      contractingPrincipal: '한국토지주택공사 (LH)',
      institutionCategory: InstitutionCategory.PUBLIC_ENTERPRISE_LH,
      contractingRegimeStatus: ContractingRegimeStatus.UNRESOLVED,
      contractingRegimeValue: ContractingRegimeValue.UNRESOLVED,
    });
    const provision = createSyntheticProvision();
    const rule = createSyntheticRule({
      requiredRegimes: [ContractingRegimeValue.NATIONAL_CONTRACT_ACT],
    });
    const contractEvent = createSyntheticEvent({ eventDate: '2025-01-10' });

    const assessment = runStageBApplicabilityEvaluation({
      project: lhProject,
      targetEvent: contractEvent,
      allProjectEvents: [contractEvent],
      confirmedFacts: [],
      candidateProvision: provision,
      rule,
    });

    expect(assessment.status).toBe('추가 사실 확인 필요');
    expect(assessment.unresolvedIssues.some((u) => u.includes('계약 법제 체계 미확정'))).toBe(true);
  });

  it('8. 조달청(Procurement Agency)이 대행하더라도 계약주체(Contracting Principal)가 지자체이면 지방계약법 체계로 판정', () => {
    const ppsLocalProject = createSyntheticProject({
      contractingPrincipal: '가람시청 (지방자치단체)',
      procurementAgency: '조달청 (중앙조달 대행)',
      contractingRegimeStatus: ContractingRegimeStatus.VERIFIED,
      contractingRegimeValue: ContractingRegimeValue.LOCAL_CONTRACT_ACT,
    });
    const nationalOnlyRule = createSyntheticRule({
      requiredRegimes: [ContractingRegimeValue.NATIONAL_CONTRACT_ACT],
      excludedRegimes: [ContractingRegimeValue.LOCAL_CONTRACT_ACT],
    });
    const localRule = createSyntheticRule({
      requiredRegimes: [ContractingRegimeValue.LOCAL_CONTRACT_ACT],
    });
    const contractEvent = createSyntheticEvent({ eventDate: '2025-01-10' });
    const provision = createSyntheticProvision();

    const nationalAssessment = runStageBApplicabilityEvaluation({
      project: ppsLocalProject,
      targetEvent: contractEvent,
      allProjectEvents: [contractEvent],
      confirmedFacts: [],
      candidateProvision: provision,
      rule: nationalOnlyRule,
    });
    expect(nationalAssessment.status).toBe('비적용 근거 확인');

    const localAssessment = runStageBApplicabilityEvaluation({
      project: ppsLocalProject,
      targetEvent: contractEvent,
      allProjectEvents: [contractEvent],
      confirmedFacts: [],
      candidateProvision: provision,
      rule: localRule,
    });
    expect(localAssessment.status).toBe('적용 근거 확인');
    expect(localAssessment.stageBEvaluation.institutionRegimeCheck).toContain('조달청');
    expect(localAssessment.stageBEvaluation.institutionRegimeCheck).toContain('LOCAL_CONTRACT_ACT');
  });

  it('9. 해당 시점의 과거 법령 원문이 미확보된 경우 현행 법령 대체 금지 및 "해당 시점 원문 미확보" 표시', () => {
    const project = createSyntheticProject();
    const missingTextProvision = createSyntheticProvision({
      verbatimKoreanText: '',
      isHistoricalTextMissing: true,
    });
    const rule = createSyntheticRule();
    const contractEvent = createSyntheticEvent({ eventDate: '2025-01-10' });

    const assessment = runStageBApplicabilityEvaluation({
      project,
      targetEvent: contractEvent,
      allProjectEvents: [contractEvent],
      confirmedFacts: [],
      candidateProvision: missingTextProvision,
      rule,
    });

    expect(assessment.status).toBe('원문 확보 필요');
    expect(assessment.verbatimSourceExcerpt).toBe('해당 시점 원문 미확보');
    expect(assessment.evidenceCompleteness.hasVerbatimHistoricalText).toBe(false);
  });

  it('10. 조문이 참조하는 별표·서식(Attachments)이 누락된 경우 미해결 쟁점 표시 및 원문 확보 필요 판정', () => {
    const project = createSyntheticProject();
    const missingAttachmentProvision = createSyntheticProvision({
      referencedAttachments: [
        {
          title: '별표 3 신기술 공사비 산정기준표',
          status: 'MISSING',
          contentOrReason: '구 예규 첨부 HWP 누락',
        },
      ],
    });
    const rule = createSyntheticRule();
    const contractEvent = createSyntheticEvent({ eventDate: '2025-01-10' });

    const assessment = runStageBApplicabilityEvaluation({
      project,
      targetEvent: contractEvent,
      allProjectEvents: [contractEvent],
      confirmedFacts: [],
      candidateProvision: missingAttachmentProvision,
      rule,
    });

    expect(assessment.status).toBe('원문 확보 필요');
    expect(assessment.evidenceCompleteness.hasCompleteAttachments).toBe(false);
    expect(assessment.unresolvedIssues.some((i) => i.includes('별표 3'))).toBe(true);
  });

  it('11. 수집된 원문에 존재하지 않는 AI 환각 인용(Hallucinated Citations) 거부 및 차단', () => {
    const realProvision = createSyntheticProvision({
      id: 'pv-real',
      officialDocumentTitle: '[가상 법령] 공공건설공사 계약특례규정',
      articleNumber: '제10조제1항',
      verbatimKoreanText:
        '[가상 예시 — 법률 판단에 사용 금지] 제10조(계약금액 조정) ① 발주기관은 물가변동 요건 충족 시 계약금액을 조정한다.',
    });

    const verification = verifyAiCitationsAgainstEvidence(
      [
        {
          sourceId: 'pv-real',
          officialTitle: '[가상 법령] 공공건설공사 계약특례규정',
          articleOrSection: '제10조제1항',
          quotedExcerpt: '발주기관은 물가변동 요건 충족 시 계약금액을 조정한다.',
        },
        {
          sourceId: 'pv-non-existent',
          officialTitle: '존재하지 않는 법령',
          articleOrSection: '제99조',
          quotedExcerpt: '하도급대금을 3배로 증액한다.',
        },
        {
          sourceId: 'pv-real',
          officialTitle: '[가상 법령] 공공건설공사 계약특례규정',
          articleOrSection: '제10조제1항',
          quotedExcerpt: '원문에 전혀 없는 변조된 문장입니다.',
        },
      ],
      [realProvision],
      []
    );

    expect(verification.allVerified).toBe(false);
    expect(verification.verifiedCitations).toHaveLength(1);
    expect(verification.rejectedCitations).toHaveLength(2);
  });

  it('12. 선행 사실관계(Fact/Event) 변경 시 이에 의존하는 기존 검토 결과를 자동으로 "재검토 필요"로 무효화', () => {
    const project = createSyntheticProject();
    const provision = createSyntheticProvision();
    const rule = createSyntheticRule();
    const contractEvent = createSyntheticEvent({ id: 'ev-target-1', eventDate: '2024-05-10' });

    const initialAssessment = runStageBApplicabilityEvaluation({
      project,
      targetEvent: contractEvent,
      allProjectEvents: [contractEvent],
      confirmedFacts: [
        {
          id: 'fact-date-1',
          projectId: project.id,
          workspaceMode: WorkspaceMode.DEMO,
          factCategory: 'DATE',
          factKey: 'contract_date',
          label: '계약체결일',
          value: '2024-05-10',
          numericValue: null,
          dateValue: '2024-05-10',
          precision: 'EXACT',
          sourceDocumentId: 'doc-1',
          pageOrSectionAnchor: 'p.1',
          paginationAvailable: true,
          verbatimExcerpt: '2024-05-10',
          status: 'CONFIRMED',
          extractedBy: 'MANUAL_USER',
          confirmedBy: '박공무',
          confirmedAt: '2026-10-01T00:00:00+09:00',
          updatedAt: '2026-10-01T00:00:00+09:00',
        },
      ],
      candidateProvision: provision,
      rule,
    });

    expect(initialAssessment.status).toBe('적용 근거 확인');

    const invalidatedList = invalidateAssessmentsOnFactChange(
      [initialAssessment],
      'fact-date-1',
      '최초 계약체결일이 2024-05-10에서 2024-02-15로 정정됨'
    );

    expect(invalidatedList[0].status).toBe('재검토 필요');
    expect(invalidatedList[0].unresolvedIssues[0]).toContain('선행 사실관계 변경으로 인한 재검토 필요');

    // 후속 법령 개정 시에는 승인된 결론을 덮어쓰지 않고 affectedByLaterAmendment 플래그만 설정하는지 함께 검증
    const flagged = flagAssessmentsAffectedByAmendment([initialAssessment], provision.id, provision);
    expect(flagged[0].affectedByLaterAmendment).toBe(true);
    expect(flagged[0].status).toBe('적용 근거 확인');
  });

  it('13. 법무 승인("법무 검토 완료")에 대한 엄격한 역할(Role) 제한 검증', () => {
    const project = createSyntheticProject();
    const provision = createSyntheticProvision();
    const rule = createSyntheticRule();
    const contractEvent = createSyntheticEvent({ eventDate: '2024-05-10' });
    const assessment = runStageBApplicabilityEvaluation({
      project,
      targetEvent: contractEvent,
      allProjectEvents: [contractEvent],
      confirmedFacts: [],
      candidateProvision: provision,
      rule,
    });

    const contributorUser: AppUser = {
      id: 'u-contrib',
      name: '박공무',
      department: '공무팀',
      role: UserRole.PROJECT_CONTRIBUTOR,
      email: 'contrib@test.kr',
      assignedProjectIds: [project.id],
    };

    const legalReviewerUser: AppUser = {
      id: 'u-legal',
      name: '김변호사',
      department: '법무팀',
      role: UserRole.LEGAL_REVIEWER,
      email: 'legal@test.kr',
      assignedProjectIds: [project.id],
    };

    expect(() =>
      applyLegalReviewDecision(
        assessment,
        contributorUser,
        'APPROVE_CONCLUSION',
        '적용',
        '실무자가 임의로 법무 검토 완료 처리 시도'
      )
    ).toThrow(/권한 거부/);

    const approved = applyLegalReviewDecision(
      assessment,
      legalReviewerUser,
      'APPROVE_CONCLUSION',
      '적용',
      '시행일 및 부칙 경과조치 요건 충족을 원문 대조로 최종 확인함'
    );
    expect(approved.updatedAssessment.status).toBe('법무 검토 완료');
    expect(approved.updatedAssessment.legalReviewConclusion).toBe('적용');
  });

  it('14. 권한 없는 타 프로젝트 접근 차단(Unauthorized Cross-Project Access) 및 열람 전용 임원 수정 차단', () => {
    const projectA = createSyntheticProject({ id: 'proj-A', projectCode: 'PRJ-A' });
    const unassignedContributor: AppUser = {
      id: 'u-other',
      name: '타현장담당',
      department: '건축팀',
      role: UserRole.PROJECT_CONTRIBUTOR,
      email: 'other@test.kr',
      assignedProjectIds: ['proj-B'],
    };
    const executiveUser: AppUser = {
      id: 'u-exec',
      name: '이임원',
      department: '임원실',
      role: UserRole.READ_ONLY_EXECUTIVE,
      email: 'exec@test.kr',
      assignedProjectIds: ['*'],
    };

    const crossCheck = authorizeProjectAccess(unassignedContributor, projectA, 'READ');
    expect(crossCheck.allowed).toBe(false);
    expect(crossCheck.statusCode).toBe(403);

    const execReadCheck = authorizeProjectAccess(executiveUser, projectA, 'READ');
    expect(execReadCheck.allowed).toBe(true);

    const execWriteCheck = authorizeProjectAccess(executiveUser, projectA, 'WRITE');
    expect(execWriteCheck.allowed).toBe(false);
    expect(execWriteCheck.statusCode).toBe(403);
  });

  it('15. 데모(DEMO) 가상 법령 픽스처와 실제(PRODUCTION) 프로젝트 데이터의 엄격한 분리 검증', () => {
    const prodProject = createSyntheticProject({
      id: 'prod-1',
      workspaceMode: WorkspaceMode.PRODUCTION,
      syntheticWarning: undefined,
    });
    const demoProvision = createSyntheticProvision({
      workspaceMode: WorkspaceMode.DEMO,
      syntheticLabel: SYNTHETIC_WARNING_LABEL,
    });
    const rule = createSyntheticRule();
    const event = createSyntheticEvent({ workspaceMode: WorkspaceMode.PRODUCTION });

    const isoCheck = validateWorkspaceIsolation(
      prodProject.workspaceMode,
      demoProvision.workspaceMode,
      demoProvision.syntheticLabel
    );
    expect(isoCheck.valid).toBe(false);

    expect(() =>
      runStageBApplicabilityEvaluation({
        project: prodProject,
        targetEvent: event,
        allProjectEvents: [event],
        confirmedFacts: [],
        candidateProvision: demoProvision,
        rule,
      })
    ).toThrow(/워크스페이스 격리 위반/);
  });

  it('16. 외부 법령 API 미설정·시간초과·오류 시 가짜 성공 결과를 생성하지 않고 한국어 조치 안내 반환 및 SSRF 차단', async () => {
    // 1) 미설정(OC 없음) 상태
    const unconf = await queryLawGoKrOpenApi({
      mode: 'SEARCH',
      target: 'law',
      query: '지방계약법',
      ocOverride: '',
    });
    expect(unconf.ok).toBe(false);
    expect(unconf.errorCode).toBe('UNCONFIGURED_LIVE_API');
    expect(unconf.messageKo).toContain('실시간 법령 연결 미설정');
    expect(unconf.rawPayload).toBeUndefined();

    // 2) 타임아웃 시뮬레이션
    const timeoutOutcome = await queryLawGoKrOpenApi({
      mode: 'SERVICE',
      target: 'eflaw',
      mst: '268920',
      ocOverride: 'test_verified_oc',
      simulatedFailureMode: 'TIMEOUT',
    });
    expect(timeoutOutcome.ok).toBe(false);
    expect(timeoutOutcome.errorCode).toBe('TIMEOUT');
    expect(timeoutOutcome.rawPayload).toBeUndefined();

    // 3) SSRF 내부망/비허용 도메인 차단 검증
    const ssrfInternal = validateAllowlistedSourceUrl('http://169.254.169.254/latest/meta-data/');
    expect(ssrfInternal.allowed).toBe(false);
    const ssrfUntrusted = validateAllowlistedSourceUrl('https://malicious-example.com/law.xml');
    expect(ssrfUntrusted.allowed).toBe(false);
    const ssrfValid = validateAllowlistedSourceUrl('https://www.law.go.kr/DRF/lawSearch.do?OC=test&target=law');
    expect(ssrfValid.allowed).toBe(true);
  });
});
