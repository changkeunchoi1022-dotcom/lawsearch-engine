import {
  ApplicabilityAssessment,
  ApplicabilityRule,
  ApplicabilityStatus,
  AppUser,
  ContractingRegimeStatus,
  ContractingRegimeValue,
  DatePrecision,
  Document,
  EventConfirmationStatus,
  Fact,
  LegalReviewConclusion,
  Project,
  ProjectEvent,
  ProjectEventType,
  ProvisionVersion,
  ReviewDecision,
  UserRole,
  WorkspaceMode,
} from '../types/legalDomain.ts';

export interface StageARetrievalResult {
  candidateVersions: ProvisionVersion[];
  retrievalSummary: string;
  cutoffDateApplied: string;
}

export interface StageBEvaluationInput {
  project: Project;
  targetEvent: ProjectEvent;
  allProjectEvents: ProjectEvent[];
  confirmedFacts: Fact[];
  candidateProvision: ProvisionVersion;
  priorProvision?: ProvisionVersion | null;
  rule: ApplicabilityRule;
  assignedReviewer?: string;
}

/**
 * Enforces strict separation between DEMO synthetic fixtures and PRODUCTION project records.
 */
export function validateWorkspaceIsolation(
  projectWorkspace: WorkspaceMode,
  evidenceWorkspace: WorkspaceMode,
  syntheticLabel?: string
): { valid: boolean; errorKo?: string } {
  if (projectWorkspace !== evidenceWorkspace) {
    return {
      valid: false,
      errorKo: `워크스페이스 격리 위반: 실제 프로젝트(${projectWorkspace})에 데모/가상 데이터(${evidenceWorkspace})를 혼합할 수 없습니다.`,
    };
  }
  if (projectWorkspace === WorkspaceMode.PRODUCTION && syntheticLabel) {
    return {
      valid: false,
      errorKo:
        '워크스페이스 격리 위반: "가상 예시 — 법률 판단에 사용 금지" 표지가 포함된 합성 데이터는 실제 프로젝트의 근거로 사용할 수 없습니다.',
    };
  }
  return { valid: true };
}

/**
 * Server-side Role-Based Access Control (RBAC) for project access.
 */
export function authorizeProjectAccess(
  user: AppUser,
  project: Project,
  operation: 'READ' | 'WRITE' | 'LEGAL_APPROVE'
): { allowed: boolean; statusCode: number; errorKo?: string } {
  // 1. Legal approval is strictly restricted to LEGAL_REVIEWER role
  if (operation === 'LEGAL_APPROVE') {
    if (user.role !== UserRole.LEGAL_REVIEWER) {
      return {
        allowed: false,
        statusCode: 403,
        errorKo:
          '권한 거부: "법무 검토 완료" 승인은 인가된 법무 검토자(LEGAL_REVIEWER)만 수행할 수 있습니다.',
      };
    }
  }

  // 2. Read-only executives can never perform write operations
  if (operation === 'WRITE' && user.role === UserRole.READ_ONLY_EXECUTIVE) {
    return {
      allowed: false,
      statusCode: 403,
      errorKo: '권한 거부: 경영진 열람 전용(READ_ONLY_EXECUTIVE) 계정은 데이터를 수정할 수 없습니다.',
    };
  }

  // 3. Cross-project access check
  const isAssigned = user.assignedProjectIds.includes(project.id) || user.assignedProjectIds.includes('*');
  if (user.role !== UserRole.ADMIN && !isAssigned) {
    return {
      allowed: false,
      statusCode: 403,
      errorKo: `권한 거부: 사용자(${user.name})에게 프로젝트 [${project.projectCode}]에 대한 접근 권한이 부여되어 있지 않습니다.`,
    };
  }

  return { allowed: true, statusCode: 200 };
}

/**
 * Stage A: Historical Version Retrieval
 * Finds candidate provision versions relevant to the event date, project history, and research cutoff date.
 * Distinguishes promulgation date, general effective date, provision-specific effective date, and cutoff date.
 */
export function runStageAHistoricalRetrieval(
  instrumentProvisions: ProvisionVersion[],
  projectEvents: ProjectEvent[],
  targetEvent: ProjectEvent,
  researchCutoffDate: string
): StageARetrievalResult {
  // Filter provisions whose promulgation or effective date is on or before the research cutoff date
  const withinCutoff = instrumentProvisions.filter((pv) => {
    const earliestRelevantDate =
      pv.promulgationDate || pv.provisionEffectiveDate || pv.generalEffectiveDate;
    if (!earliestRelevantDate) return true;
    return earliestRelevantDate <= researchCutoffDate;
  });

  // Sort chronologically by effective date (provision-specific first, then general)
  const sorted = [...withinCutoff].sort((a, b) => {
    const dateA = a.provisionEffectiveDate || a.generalEffectiveDate || a.promulgationDate || '0000-00-00';
    const dateB = b.provisionEffectiveDate || b.generalEffectiveDate || b.promulgationDate || '0000-00-00';
    return dateA.localeCompare(dateB);
  });

  const contractEvent = projectEvents.find(
    (e) => e.eventType === ProjectEventType.CONTRACT_EXECUTION && e.confirmationStatus === EventConfirmationStatus.CONFIRMED
  );
  const tenderEvent = projectEvents.find(
    (e) => e.eventType === ProjectEventType.TENDER_ANNOUNCEMENT && e.confirmationStatus === EventConfirmationStatus.CONFIRMED
  );

  const summaryParts: string[] = [
    `연구 기준일(Cutoff: ${researchCutoffDate}) 이전 공포·시행된 후보 조문 버전 ${sorted.length}건을 식별함.`,
  ];
  if (tenderEvent?.eventDate) {
    summaryParts.push(`입찰공고일(${tenderEvent.eventDate})`);
  }
  if (contractEvent?.eventDate) {
    summaryParts.push(`최초 계약체결일(${contractEvent.eventDate})`);
  }
  if (targetEvent.eventDate) {
    summaryParts.push(`대상 이벤트 [${targetEvent.eventTitle}] 발생일(${targetEvent.eventDate})`);
  } else {
    summaryParts.push(`대상 이벤트 [${targetEvent.eventTitle}] 일자 미상`);
  }

  return {
    candidateVersions: sorted,
    retrievalSummary: summaryParts.join(' · '),
    cutoffDateApplied: researchCutoffDate,
  };
}

/**
 * Helper to look up the required trigger event for a rule
 */
function resolveTriggerEventForRule(
  rule: ApplicabilityRule,
  targetEvent: ProjectEvent,
  allProjectEvents: ProjectEvent[]
): { event: ProjectEvent | null; labelKo: string } {
  switch (rule.effectiveDateTriggerType) {
    case 'TENDER_ANNOUNCEMENT_DATE': {
      const ev =
        allProjectEvents.find((e) => e.eventType === ProjectEventType.TENDER_ANNOUNCEMENT) || null;
      return { event: ev, labelKo: '입찰공고일' };
    }
    case 'CONTRACT_EXECUTION_DATE': {
      const ev =
        allProjectEvents.find((e) => e.eventType === ProjectEventType.CONTRACT_EXECUTION) || null;
      return { event: ev, labelKo: '최초 도급계약 체결일' };
    }
    case 'SUBSEQUENT_ANNUAL_CONTRACT_DATE': {
      const ev =
        allProjectEvents.find((e) => e.eventType === ProjectEventType.SUBSEQUENT_ANNUAL_CONTRACT) ||
        null;
      return { event: ev, labelKo: '차수별 연차계약 체결일' };
    }
    case 'COMMENCEMENT_DATE': {
      const ev =
        allProjectEvents.find((e) => e.eventType === ProjectEventType.ACTUAL_COMMENCEMENT) || null;
      return { event: ev, labelKo: '실착공일' };
    }
    case 'EVENT_FACTUAL_TRIGGER_DATE':
    default:
      return { event: targetEvent, labelKo: `${targetEvent.eventTitle} (사실적 발생 시점)` };
  }
}

/**
 * Deterministic date comparison on YYYY-MM-DD strings
 */
export function evaluateDateBoundary(
  triggerDate: string,
  boundaryDate: string,
  comparison: 'ON_OR_AFTER' | 'STRICTLY_AFTER' | 'ON_OR_BEFORE'
): boolean {
  if (comparison === 'ON_OR_AFTER') {
    return triggerDate >= boundaryDate;
  }
  if (comparison === 'STRICTLY_AFTER') {
    return triggerDate > boundaryDate;
  }
  return triggerDate <= boundaryDate;
}

/**
 * Stage B: Event-Specific Applicability Review
 * Evaluates subject matter, institution/contracting regime (without inferring from PPS alone),
 * monetary threshold, effective-date boundaries (general vs provision-specific),
 * application clauses, transitional provisions preserving prior rules, missing attachments,
 * missing historical source text, and precedent dependencies.
 */
export function runStageBApplicabilityEvaluation(
  input: StageBEvaluationInput
): ApplicabilityAssessment {
  const {
    project,
    targetEvent,
    allProjectEvents,
    candidateProvision,
    priorProvision,
    rule,
    assignedReviewer = project.legalReviewer || '미지정 법무검토자',
  } = input;

  // Enforce workspace isolation first
  const isolation = validateWorkspaceIsolation(
    project.workspaceMode,
    candidateProvision.workspaceMode,
    candidateProvision.syntheticLabel
  );
  if (!isolation.valid) {
    throw new Error(isolation.errorKo);
  }

  const unresolvedIssues: string[] = [];

  // 1. Check historical source text availability
  const hasVerbatimHistoricalText =
    !candidateProvision.isHistoricalTextMissing &&
    candidateProvision.verbatimKoreanText.trim().length > 0;
  if (!hasVerbatimHistoricalText) {
    unresolvedIssues.push(
      `해당 시점 원문 미확보: [${candidateProvision.officialDocumentTitle} ${candidateProvision.articleNumber}] (${candidateProvision.amendmentNumber})의 당시 시행 원문이 확보되지 않았습니다. 현행 법령으로 대체하여 판단할 수 없습니다.`
    );
  }

  // 2. Check referenced attachments (별표·서식)
  const missingAttachments = candidateProvision.referencedAttachments.filter(
    (att) => att.status === 'MISSING'
  );
  const hasCompleteAttachments = missingAttachments.length === 0;
  if (!hasCompleteAttachments) {
    for (const att of missingAttachments) {
      unresolvedIssues.push(
        `조문 참조 별표·서식 미확보: [${att.title}] 원문이 누락되었습니다 (${att.contentOrReason}).`
      );
    }
  }

  // 3. Check Contracting Regime & Public Procurement Service (조달청) separation
  let institutionRegimeCheck = '';
  const hasVerifiedRegime =
    project.contractingRegimeStatus === ContractingRegimeStatus.VERIFIED &&
    project.contractingRegimeValue !== ContractingRegimeValue.UNRESOLVED;

  if (!hasVerifiedRegime) {
    institutionRegimeCheck = `발주처(${project.contractingPrincipal})의 적용 계약 법제 체계가 '${project.contractingRegimeStatus}' 상태입니다. 기관명이나 조달청 관여 여부만으로 국가계약법 적용을 단정할 수 없습니다.`;
    unresolvedIssues.push(
      `계약 법제 체계 미확정: 발주처(${project.contractingPrincipal})의 근거 법령(공기업·준정부기관 계약사무규칙, 자체 계약규정 등) 및 실제 편입된 공사계약일반조건 버전을 확인해야 합니다.`
    );
  } else {
    const ppsNote =
      project.procurementAgency && project.procurementAgency.includes('조달청')
        ? ` (조달 대행기관이 '${project.procurementAgency}'이나, 계약주체인 '${project.contractingPrincipal}'의 법제 체계인 [${project.contractingRegimeValue}]를 기준으로 판단함)`
        : '';
    institutionRegimeCheck = `계약주체 '${project.contractingPrincipal}'의 확인된 법제 체계는 [${project.contractingRegimeValue}]입니다${ppsNote}.`;
  }

  // Check regime match against rule
  const regimeMatchesRule =
    rule.requiredRegimes.length === 0 ||
    (hasVerifiedRegime && rule.requiredRegimes.includes(project.contractingRegimeValue));
  const regimeExplicitlyExcluded =
    hasVerifiedRegime && rule.excludedRegimes.includes(project.contractingRegimeValue);

  // 4. Monetary threshold check
  let thresholdCheck = '별도 금액 기준 조건 없음';
  let thresholdMet = true;
  if (rule.minThresholdAmountKrw !== null) {
    if (project.totalContractAmountKrw === null) {
      thresholdCheck = `규정 적용 기준금액(${rule.minThresholdAmountKrw.toLocaleString('ko-KR')}원 이상) 확인을 위해 총 계약금액 확정이 필요하나 현재 금액 미상입니다.`;
      unresolvedIssues.push('총 도급계약금액(부가세 포함/별도 기준) 사실 확인 필요');
      thresholdMet = false;
    } else if (project.totalContractAmountKrw >= rule.minThresholdAmountKrw) {
      thresholdCheck = `총 계약금액 ${project.totalContractAmountKrw.toLocaleString('ko-KR')}원 ≥ 기준금액 ${rule.minThresholdAmountKrw.toLocaleString('ko-KR')}원 충족.`;
      thresholdMet = true;
    } else {
      thresholdCheck = `총 계약금액 ${project.totalContractAmountKrw.toLocaleString('ko-KR')}원 < 기준금액 ${rule.minThresholdAmountKrw.toLocaleString('ko-KR')}원 미달 (적용 제외).`;
      thresholdMet = false;
    }
  }

  // 5. Location check
  let locationCheck = `현장 소재지(${project.projectLocation || '미상'}) 및 관할 지자체(${project.localGovernment || '미상'}) 확인`;
  let locationMet = true;
  if (rule.requiredLocationKeywords.length > 0) {
    const combinedLoc = `${project.projectLocation} ${project.localGovernment}`;
    locationMet = rule.requiredLocationKeywords.some((kw) => combinedLoc.includes(kw));
    locationCheck = locationMet
      ? `관할 지역 요건(${rule.requiredLocationKeywords.join(', ')}) 충족 (${combinedLoc}).`
      : `관할 지역 요건(${rule.requiredLocationKeywords.join(', ')}) 불일치 (현장: ${combinedLoc}).`;
  }

  // 6. Effective Date Boundary (Distinguishing Promulgation, General Effective Date, Provision-Specific Effective Date)
  const effectiveBoundaryDate =
    candidateProvision.provisionEffectiveDate ||
    candidateProvision.generalEffectiveDate ||
    rule.referenceBoundaryDate;

  const hasDifferentProvisionEffectiveDate =
    candidateProvision.provisionEffectiveDate &&
    candidateProvision.generalEffectiveDate &&
    candidateProvision.provisionEffectiveDate !== candidateProvision.generalEffectiveDate;

  const { event: triggerEvent, labelKo: triggerTypeLabel } = resolveTriggerEventForRule(
    rule,
    targetEvent,
    allProjectEvents
  );

  const hasConfirmedEventDate =
    triggerEvent !== null &&
    triggerEvent.eventDate !== null &&
    triggerEvent.datePrecision === DatePrecision.EXACT_DAY &&
    triggerEvent.confirmationStatus === EventConfirmationStatus.CONFIRMED;

  let effectiveDateBoundaryCheck = '';
  let dateBoundaryMet = false;

  if (!triggerEvent || !triggerEvent.eventDate || triggerEvent.datePrecision !== DatePrecision.EXACT_DAY) {
    effectiveDateBoundaryCheck = `판단 기준 시점인 [${triggerTypeLabel}]의 정확한 일자(YYYY-MM-DD)가 확인되지 않았습니다 (정밀도: ${triggerEvent?.datePrecision || 'UNKNOWN'}). 임의로 계약일이나 현재일을 대입하지 않습니다.`;
    unresolvedIssues.push(
      `기준 시점([${triggerTypeLabel}])의 확정 일자 및 출처 문서(페이지/절) 확인 필요`
    );
  } else if (triggerEvent.confirmationStatus !== EventConfirmationStatus.CONFIRMED) {
    effectiveDateBoundaryCheck = `판단 기준 시점인 [${triggerTypeLabel}: ${triggerEvent.eventDate}]가 아직 '${triggerEvent.confirmationStatus}' 상태이므로 담당자 사실 확정이 필요합니다.`;
    unresolvedIssues.push(
      `기준 시점([${triggerTypeLabel}: ${triggerEvent.eventDate}])의 추출 사실 확정(Confirm) 필요`
    );
  } else {
    dateBoundaryMet = evaluateDateBoundary(
      triggerEvent.eventDate,
      effectiveBoundaryDate,
      rule.boundaryComparison
    );
    const compSymbol =
      rule.boundaryComparison === 'ON_OR_AFTER'
        ? '≥ (이 영 시행일 이후)'
        : rule.boundaryComparison === 'STRICTLY_AFTER'
        ? '> (시행일 다음 날 이후)'
        : '≤ (시행일 이전)';
    const diffNotice = hasDifferentProvisionEffectiveDate
      ? ` [주의: 본 개정법령의 일반 시행일은 ${candidateProvision.generalEffectiveDate}이나, ${candidateProvision.articleNumber}의 조문별 개별 시행일은 ${candidateProvision.provisionEffectiveDate}임]`
      : '';
    effectiveDateBoundaryCheck = `기준 시점 [${triggerTypeLabel}: ${triggerEvent.eventDate}] vs 조문 시행 기준일 [${effectiveBoundaryDate}] (${compSymbol}) 비교 결과: ${
      dateBoundaryMet ? '시행일 범위 내 해당' : '시행일 기준 미충족'
    }.${diffNotice}`;
  }

  // 7. Supplementary Provisions, Application Clauses & Transitional Provisions (부칙·적용례·경과조치)
  let applicationAndTransitionalCheck = '';
  let transitionalPreservesPriorRule = false;
  let hasResolvedTransitionalClause = true;

  const contractEvent = allProjectEvents.find(
    (e) => e.eventType === ProjectEventType.CONTRACT_EXECUTION
  );
  const tenderEvent = allProjectEvents.find(
    (e) => e.eventType === ProjectEventType.TENDER_ANNOUNCEMENT
  );

  if (rule.hasTransitionalPreservationOfPriorRule) {
    // Check if contract execution or tender announcement occurred BEFORE the new provision's effective date
    const priorAnchorEvent = tenderEvent?.eventDate ? tenderEvent : contractEvent;
    if (
      !priorAnchorEvent ||
      !priorAnchorEvent.eventDate ||
      priorAnchorEvent.confirmationStatus !== EventConfirmationStatus.CONFIRMED
    ) {
      hasResolvedTransitionalClause = false;
      applicationAndTransitionalCheck = `부칙 경과조치("${rule.transitionalConditionDescription}") 적용 여부를 판단하기 위해 최초 입찰공고일 또는 계약체결일의 사실 확정이 필요합니다.`;
      unresolvedIssues.push(
        '부칙 경과조치(종전 규정 적용 여부) 판단을 위한 입찰공고일/최초계약체결일 확정 필요'
      );
    } else if (priorAnchorEvent.eventDate < effectiveBoundaryDate) {
      transitionalPreservesPriorRule = true;
      const priorTitle = priorProvision
        ? `${priorProvision.officialDocumentTitle} ${priorProvision.articleNumber} (${priorProvision.amendmentNumber})`
        : '종전 규정';
      applicationAndTransitionalCheck = `대상 이벤트(${targetEvent.eventTitle}: ${targetEvent.eventDate || '미상'})는 개정 규정 시행일(${effectiveBoundaryDate}) 이후에 발생하였으나, 부칙 경과조치(${rule.transitionalConditionDescription})에 따라 시행일 전 입찰공고·계약체결(${priorAnchorEvent.eventDate})된 본 공사는 개정 규정이 아닌 [${priorTitle}]이(가) 그대로 적용됩니다.`;
    } else {
      applicationAndTransitionalCheck = `입찰공고·계약체결일(${priorAnchorEvent.eventDate})이 시행일(${effectiveBoundaryDate}) 이후이므로 부칙 경과조치에 따른 종전 규정 보존 대상이 아니며 개정 규정이 적용됩니다.`;
    }
  } else if (rule.effectiveDateTriggerType === 'EVENT_FACTUAL_TRIGGER_DATE') {
    applicationAndTransitionalCheck = `본 조문(${candidateProvision.articleNumber})은 부칙상 계약체결일 기준 경과조치를 두지 않고 시공·현장 행위 발생 시점(${triggerTypeLabel})에 시행 중인 법령을 즉시 적용하는 규제입니다. 계약 체결 후 제·개정된 법령이라도 행위 시점에 시행 중이면 적용됩니다.`;
  } else {
    applicationAndTransitionalCheck =
      candidateProvision.applicationClauseText ||
      candidateProvision.supplementaryProvisionsText ||
      '부칙 일반 시행규정 적용';
  }

  // 8. Precedent / Official Interpretation Dependency
  let hasRequiredPrecedent = true;
  if (candidateProvision.precedentOrInterpretationDependency.required) {
    if (!candidateProvision.precedentOrInterpretationDependency.authoritySourceRetrieved) {
      hasRequiredPrecedent = false;
      unresolvedIssues.push(
        `판례·유권해석 의존 쟁점 미해결: ${candidateProvision.precedentOrInterpretationDependency.description} (관련 대법원 판례 또는 유권해석 원문 확보 필요)`
      );
    }
  }

  // 9. Determine Status (Never use numerical confidence scores; never mark '법무 검토 완료' automatically)
  let status: ApplicabilityStatus = '적용 후보';

  if (!hasVerbatimHistoricalText || !hasCompleteAttachments) {
    status = '원문 확보 필요';
  } else if (!hasConfirmedEventDate || !hasVerifiedRegime || !hasRequiredPrecedent || (rule.minThresholdAmountKrw !== null && project.totalContractAmountKrw === null)) {
    status = '추가 사실 확인 필요';
  } else if (!hasResolvedTransitionalClause) {
    status = '부칙·경과조치 검토 필요';
  } else if (regimeExplicitlyExcluded || !regimeMatchesRule || !locationMet || !thresholdMet) {
    status = '비적용 근거 확인';
  } else if (transitionalPreservesPriorRule) {
    // New provision is not applicable because transitional clause preserves prior rule
    status = '비적용 근거 확인';
  } else if (dateBoundaryMet) {
    status = '적용 근거 확인';
  } else {
    status = '비적용 근거 확인';
  }

  // Check if rule itself has not been human-approved yet
  if (rule.approvalStatus !== 'VERIFIED_BY_HUMAN' && status === '적용 근거 확인') {
    status = '적용 후보';
    unresolvedIssues.push(
      'AI가 제안한 적용 요건 규칙(Rule)이 아직 법무 담당자에 의해 승인(VERIFIED_BY_HUMAN)되지 않았습니다.'
    );
  }

  const completenessFlags = [
    hasConfirmedEventDate,
    hasVerifiedRegime,
    hasVerbatimHistoricalText,
    hasCompleteAttachments,
    hasResolvedTransitionalClause,
    hasRequiredPrecedent,
  ];
  const passedCount = completenessFlags.filter(Boolean).length;
  const summaryLabel =
    passedCount === completenessFlags.length && unresolvedIssues.length === 0
      ? '필수 증거 및 시점 요건 확보 완료 (법무 최종 검토 대기)'
      : `미해결 쟁점 ${unresolvedIssues.length}건 존재 (결론 단정 불가)`;

  const incorporatedSummary =
    project.incorporatedDocuments.length > 0
      ? project.incorporatedDocuments
          .map((d) => `${d.title} (${d.versionOrEffectiveDate})`)
          .join(', ')
      : '편입 계약조건 목록 미등록';

  const nowIso = new Date().toISOString();

  return {
    id: `assess-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    projectId: project.id,
    eventId: targetEvent.id,
    provisionVersionId: candidateProvision.id,
    ruleId: rule.id,
    workspaceMode: project.workspaceMode,
    syntheticLabel: project.syntheticWarning || candidateProvision.syntheticLabel,
    researchCategory: rule.researchCategory,
    issueTitle: rule.issueTitle,
    referenceDateUsed: triggerEvent?.eventDate || null,
    referenceDateTypeLabel: triggerTypeLabel,
    status,
    legalReviewConclusion: null, // Must only be set by authorized LEGAL_REVIEWER
    stageARetrievalSummary: `공포일(${candidateProvision.promulgationDate || '미상'}) · 일반시행일(${candidateProvision.generalEffectiveDate || '미상'}) · 조문시행일(${candidateProvision.provisionEffectiveDate || '일반시행일과 동일'}) 기준 버전 검증`,
    stageBEvaluation: {
      subjectMatterMatch: `${rule.issueTitle} (${candidateProvision.officialDocumentTitle} ${candidateProvision.articleNumber})`,
      institutionRegimeCheck,
      projectContractTypeCheck: `${project.constructionType} / ${project.contractStructure}`,
      locationCheck,
      thresholdCheck,
      effectiveDateBoundaryCheck,
      applicationAndTransitionalCheck,
      incorporatedConditionsCheck: incorporatedSummary,
    },
    verbatimSourceExcerpt: hasVerbatimHistoricalText
      ? candidateProvision.verbatimKoreanText
      : '해당 시점 원문 미확보',
    modelOrRuleAnalysisText: [
      `[시점·요건 판단 요약] ${effectiveDateBoundaryCheck}`,
      `[발주처 법제 체계] ${institutionRegimeCheck}`,
      `[부칙 및 경과조치] ${applicationAndTransitionalCheck}`,
    ].join('\n'),
    supplementaryAndTransitionalAnalysis: applicationAndTransitionalCheck,
    unresolvedIssues,
    evidenceCompleteness: {
      hasConfirmedEventDate,
      hasVerifiedRegime,
      hasVerbatimHistoricalText,
      hasCompleteAttachments,
      hasResolvedTransitionalClause,
      hasRequiredPrecedent,
      summaryLabel,
    },
    dependentFactIds: input.confirmedFacts.map((f) => f.id),
    dependentProvisionVersionIds: priorProvision
      ? [candidateProvision.id, priorProvision.id]
      : [candidateProvision.id],
    affectedByLaterAmendment: false,
    laterAmendmentNote: null,
    assignedReviewer,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/**
 * Verifies AI-proposed citations against actual retrieved ProvisionVersion and Document records.
 * Rejects or flags any citation whose source ID, article number, or verbatim excerpt does not exist in retrieved evidence.
 */
export interface ProposedAiCitation {
  sourceId: string;
  officialTitle: string;
  articleOrSection: string;
  quotedExcerpt: string;
}

export function verifyAiCitationsAgainstEvidence(
  proposedCitations: ProposedAiCitation[],
  retrievedProvisions: ProvisionVersion[],
  uploadedDocuments: Document[]
): {
  allVerified: boolean;
  verifiedCitations: ProposedAiCitation[];
  rejectedCitations: Array<{ citation: ProposedAiCitation; reasonKo: string }>;
} {
  const verifiedCitations: ProposedAiCitation[] = [];
  const rejectedCitations: Array<{ citation: ProposedAiCitation; reasonKo: string }> = [];

  for (const cit of proposedCitations) {
    const matchedProvision = retrievedProvisions.find(
      (pv) =>
        pv.id === cit.sourceId ||
        pv.officialMstOrVersionId === cit.sourceId ||
        (pv.officialDocumentTitle === cit.officialTitle && pv.articleNumber === cit.articleOrSection)
    );
    const matchedDoc = uploadedDocuments.find((doc) => doc.id === cit.sourceId);

    if (!matchedProvision && !matchedDoc) {
      rejectedCitations.push({
        citation: cit,
        reasonKo: `인용 거부: 수집된 법령 버전 또는 프로젝트 문서에 존재하지 않는 출처(${cit.officialTitle} ${cit.articleOrSection}, ID: ${cit.sourceId})입니다.`,
      });
      continue;
    }

    if (matchedProvision) {
      if (matchedProvision.isHistoricalTextMissing || !matchedProvision.verbatimKoreanText.trim()) {
        rejectedCitations.push({
          citation: cit,
          reasonKo: `인용 거부: [${matchedProvision.officialDocumentTitle} ${matchedProvision.articleNumber}]는 '해당 시점 원문 미확보' 상태이므로 원문 인용이 불가능합니다.`,
        });
        continue;
      }

      const fullSourceText = `${matchedProvision.verbatimKoreanText}\n${matchedProvision.supplementaryProvisionsText}\n${matchedProvision.applicationClauseText}\n${matchedProvision.transitionalProvisionText}`;
      const normalizedQuote = cit.quotedExcerpt.trim();
      if (!normalizedQuote || !fullSourceText.includes(normalizedQuote)) {
        rejectedCitations.push({
          citation: cit,
          reasonKo: `인용 거부: 제시된 인용문("${cit.quotedExcerpt}")이 수집된 조문 원문과 정확히 일치하지 않습니다 (임의 변형 또는 환각 인용 차단).`,
        });
        continue;
      }
    }

    if (matchedDoc) {
      const normalizedQuote = cit.quotedExcerpt.trim();
      if (!normalizedQuote || !matchedDoc.rawContentText.includes(normalizedQuote)) {
        rejectedCitations.push({
          citation: cit,
          reasonKo: `인용 거부: 제시된 인용문("${cit.quotedExcerpt}")이 업로드된 문서(${matchedDoc.originalFilename}) 원문에서 확인되지 않습니다.`,
        });
        continue;
      }
    }

    verifiedCitations.push(cit);
  }

  return {
    allVerified: rejectedCitations.length === 0,
    verifiedCitations,
    rejectedCitations,
  };
}

/**
 * Invalidates dependent assessments when a project fact or event changes,
 * marking status as '재검토 필요' while preserving audit history.
 */
export function invalidateAssessmentsOnFactChange(
  assessments: ApplicabilityAssessment[],
  changedFactOrEventId: string,
  changeDescriptionKo: string
): ApplicabilityAssessment[] {
  const nowIso = new Date().toISOString();
  return assessments.map((assessment) => {
    const dependsOnChangedItem =
      assessment.eventId === changedFactOrEventId ||
      assessment.dependentFactIds.includes(changedFactOrEventId);

    if (!dependsOnChangedItem) {
      return assessment;
    }

    return {
      ...assessment,
      status: '재검토 필요',
      unresolvedIssues: [
        `선행 사실관계 변경으로 인한 재검토 필요: ${changeDescriptionKo} (기존 검토 상태: ${assessment.status})`,
        ...assessment.unresolvedIssues,
      ],
      updatedAt: nowIso,
    };
  });
}

/**
 * Flags assessments affected by a subsequent amendment WITHOUT overwriting an approved historical conclusion.
 */
export function flagAssessmentsAffectedByAmendment(
  assessments: ApplicabilityAssessment[],
  priorProvisionVersionId: string,
  newProvision: ProvisionVersion
): ApplicabilityAssessment[] {
  const nowIso = new Date().toISOString();
  return assessments.map((assessment) => {
    if (!assessment.dependentProvisionVersionIds.includes(priorProvisionVersionId)) {
      return assessment;
    }

    // Never overwrite an approved historical conclusion ('법무 검토 완료'), only flag affectedByLaterAmendment
    return {
      ...assessment,
      affectedByLaterAmendment: true,
      laterAmendmentNote: `후속 개정 감지: [${newProvision.officialDocumentTitle} ${newProvision.articleNumber}] (${newProvision.amendmentNumber}, 시행일 ${
        newProvision.provisionEffectiveDate || newProvision.generalEffectiveDate
      }) 개정이 등록되었습니다. 기존 승인된 결론(${assessment.legalReviewConclusion || assessment.status})은 보존되며 개정 영향 워크스페이스에서 재검토 여부를 결정하십시오.`,
      updatedAt: nowIso,
    };
  });
}

/**
 * Applies a Legal Reviewer's decision, strictly enforcing that ONLY UserRole.LEGAL_REVIEWER can mark '법무 검토 완료'.
 */
export function applyLegalReviewDecision(
  assessment: ApplicabilityAssessment,
  user: AppUser,
  decisionType: ReviewDecision['decisionType'],
  recordedConclusion: LegalReviewConclusion,
  reasonText: string
): { updatedAssessment: ApplicabilityAssessment; decisionRecord: ReviewDecision } {
  if (user.role !== UserRole.LEGAL_REVIEWER) {
    throw new Error(
      '권한 거부: 오직 법무 검토자(LEGAL_REVIEWER) 역할만 법무 검토 결정을 등록하거나 "법무 검토 완료"로 표시할 수 있습니다.'
    );
  }

  if (!reasonText || reasonText.trim().length < 5) {
    throw new Error('검토 사유 및 판단 근거를 5자 이상 구체적으로 입력해야 합니다.');
  }

  let resultingStatus: ApplicabilityStatus = assessment.status;
  if (decisionType === 'APPROVE_CONCLUSION') {
    if (!recordedConclusion) {
      throw new Error(
        '"법무 검토 완료" 처리 시 실제 법무 결론(적용 / 비적용 / 조건부 적용 / 판단 보류)을 반드시 함께 기록해야 합니다.'
      );
    }
    resultingStatus = '법무 검토 완료';
  } else if (decisionType === 'REQUEST_MORE_FACTS') {
    resultingStatus = '추가 사실 확인 필요';
  } else if (decisionType === 'FLAG_TRANSITIONAL_REVIEW') {
    resultingStatus = '부칙·경과조치 검토 필요';
  } else if (decisionType === 'REJECT_ANALYSIS') {
    resultingStatus = '재검토 필요';
  }

  const nowIso = new Date().toISOString();

  const updatedAssessment: ApplicabilityAssessment = {
    ...assessment,
    status: resultingStatus,
    legalReviewConclusion:
      decisionType === 'APPROVE_CONCLUSION' ? recordedConclusion : assessment.legalReviewConclusion,
    reviewedBy: `${user.name} (${user.department})`,
    reviewedAt: nowIso,
    updatedAt: nowIso,
  };

  const decisionRecord: ReviewDecision = {
    id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    assessmentId: assessment.id,
    projectId: assessment.projectId,
    workspaceMode: assessment.workspaceMode,
    decisionType,
    resultingStatus,
    recordedConclusion,
    reasonText: reasonText.trim(),
    reviewerId: user.id,
    reviewerName: user.name,
    reviewerRole: user.role,
    decidedAt: nowIso,
  };

  return { updatedAssessment, decisionRecord };
}
