export enum WorkspaceMode {
  PRODUCTION = 'PRODUCTION',
  DEMO = 'DEMO',
}

export enum UserRole {
  ADMIN = 'ADMIN',
  LEGAL_REVIEWER = 'LEGAL_REVIEWER',
  PROJECT_CONTRIBUTOR = 'PROJECT_CONTRIBUTOR',
  READ_ONLY_EXECUTIVE = 'READ_ONLY_EXECUTIVE',
}

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.ADMIN]: '관리자 (Administrator)',
  [UserRole.LEGAL_REVIEWER]: '법무 검토자 (Legal Reviewer)',
  [UserRole.PROJECT_CONTRIBUTOR]: '프로젝트 실무자 (Project Contributor)',
  [UserRole.READ_ONLY_EXECUTIVE]: '경영진 열람 전용 (Read-Only Executive)',
};

export interface AppUser {
  id: string;
  name: string;
  department: string;
  role: UserRole;
  email: string;
  assignedProjectIds: string[];
}

export enum InstitutionCategory {
  CENTRAL_GOVERNMENT = 'CENTRAL_GOVERNMENT',
  LOCAL_GOVERNMENT = 'LOCAL_GOVERNMENT',
  PUBLIC_ENTERPRISE_LH = 'PUBLIC_ENTERPRISE_LH',
  OTHER_PUBLIC_INSTITUTION = 'OTHER_PUBLIC_INSTITUTION',
  UNVERIFIED = 'UNVERIFIED',
}

export const INSTITUTION_CATEGORY_LABELS: Record<InstitutionCategory, string> = {
  [InstitutionCategory.CENTRAL_GOVERNMENT]: '중앙행정기관 (국가기관)',
  [InstitutionCategory.LOCAL_GOVERNMENT]: '지방자치단체 (광역·기초·교육청)',
  [InstitutionCategory.PUBLIC_ENTERPRISE_LH]: '공기업 (한국토지주택공사 LH 등)',
  [InstitutionCategory.OTHER_PUBLIC_INSTITUTION]: '기타 공공기관·준정부기관·지방공기업',
  [InstitutionCategory.UNVERIFIED]: '기관 분류 미확인',
};

export enum ContractingRegimeStatus {
  VERIFIED = 'VERIFIED',
  PROPOSED = 'PROPOSED',
  UNRESOLVED = 'UNRESOLVED',
}

export const CONTRACTING_REGIME_STATUS_LABELS: Record<ContractingRegimeStatus, string> = {
  [ContractingRegimeStatus.VERIFIED]: '법제 체계 확인 완료',
  [ContractingRegimeStatus.PROPOSED]: '제안됨 (법무·원문 확인 대기)',
  [ContractingRegimeStatus.UNRESOLVED]: '미해결 (단정 금지)',
};

export enum ContractingRegimeValue {
  NATIONAL_CONTRACT_ACT = 'NATIONAL_CONTRACT_ACT',
  LOCAL_CONTRACT_ACT = 'LOCAL_CONTRACT_ACT',
  PUBLIC_INSTITUTION_RULES_AND_NATIONAL = 'PUBLIC_INSTITUTION_RULES_AND_NATIONAL',
  AGENCY_SPECIFIC_REGIME = 'AGENCY_SPECIFIC_REGIME',
  UNRESOLVED = 'UNRESOLVED',
}

export const CONTRACTING_REGIME_VALUE_LABELS: Record<ContractingRegimeValue, string> = {
  [ContractingRegimeValue.NATIONAL_CONTRACT_ACT]: '국가계약법령 체계 (국가를 당사자로 하는 계약에 관한 법률)',
  [ContractingRegimeValue.LOCAL_CONTRACT_ACT]: '지방계약법령 체계 (지방자치단체를 당사자로 하는 계약에 관한 법률)',
  [ContractingRegimeValue.PUBLIC_INSTITUTION_RULES_AND_NATIONAL]: '공기업·준정부기관 계약사무규칙 + 기관 자체 계약규정 + 국가계약법 준용 체계',
  [ContractingRegimeValue.AGENCY_SPECIFIC_REGIME]: '기타 공공기관 자체 계약규정 및 개별 편입 조건 체계',
  [ContractingRegimeValue.UNRESOLVED]: '적용 계약 법제 미확정 (발주처 근거규정 및 계약서 확인 필요)',
};

export enum ContractorRole {
  MAIN_CONTRACTOR = 'MAIN_CONTRACTOR',
  JOINT_VENTURE_LEAD = 'JOINT_VENTURE_LEAD',
  JOINT_VENTURE_MEMBER = 'JOINT_VENTURE_MEMBER',
  SUBCONTRACTOR = 'SUBCONTRACTOR',
}

export const CONTRACTOR_ROLE_LABELS: Record<ContractorRole, string> = {
  [ContractorRole.MAIN_CONTRACTOR]: '단독 원도급사',
  [ContractorRole.JOINT_VENTURE_LEAD]: '공동수급체 대표사',
  [ContractorRole.JOINT_VENTURE_MEMBER]: '공동수급체 구성원사',
  [ContractorRole.SUBCONTRACTOR]: '하도급사',
};

export enum LongTermStructureType {
  LONG_TERM_CONTINUING = 'LONG_TERM_CONTINUING',
  CONTINUING_EXPENDITURE = 'CONTINUING_EXPENDITURE',
  SINGLE_YEAR = 'SINGLE_YEAR',
  OTHER = 'OTHER',
}

export const LONG_TERM_STRUCTURE_LABELS: Record<LongTermStructureType, string> = {
  [LongTermStructureType.LONG_TERM_CONTINUING]: '장기계속계약 (차수별 연차계약 체결)',
  [LongTermStructureType.CONTINUING_EXPENDITURE]: '계속비계약 (총괄계약 일괄 구속)',
  [LongTermStructureType.SINGLE_YEAR]: '단년도 일반공사계약',
  [LongTermStructureType.OTHER]: '기타 특수계약 구조',
};

export enum VatTreatment {
  VAT_INCLUDED = 'VAT_INCLUDED',
  VAT_EXCLUDED = 'VAT_EXCLUDED',
  ZERO_RATED = 'ZERO_RATED',
  UNSPECIFIED = 'UNSPECIFIED',
}

export const VAT_TREATMENT_LABELS: Record<VatTreatment, string> = {
  [VatTreatment.VAT_INCLUDED]: '부가가치세 포함',
  [VatTreatment.VAT_EXCLUDED]: '부가가치세 별도',
  [VatTreatment.ZERO_RATED]: '영세율·면세 대상 (국민주택규모 등)',
  [VatTreatment.UNSPECIFIED]: '부가세 처리기준 미확인',
};

export type ResearchCategoryCode =
  | 'NATIONAL_PUBLIC_CONTRACT'
  | 'LOCAL_GOVERNMENT_CONTRACT'
  | 'PUBLIC_INSTITUTION_RULES'
  | 'CONSTRUCTION_INDUSTRY_REG'
  | 'CONSTRUCTION_TECH_QUALITY'
  | 'OCCUPATIONAL_SAFETY_SAPA'
  | 'BUILDING_AND_PERMITS'
  | 'SUBCONTRACTING_PAYMENT'
  | 'LABOR_SITE_OBLIGATIONS'
  | 'ENVIRONMENTAL_WASTE_NOISE'
  | 'ELECTRONIC_PROCUREMENT'
  | 'LOCAL_ORDINANCES'
  | 'PROCUREMENT_NOTICE_CONDITIONS';

export const RESEARCH_CATEGORIES: Array<{
  code: ResearchCategoryCode;
  label: string;
  description: string;
}> = [
  {
    code: 'NATIONAL_PUBLIC_CONTRACT',
    label: '국가 공공계약 법령',
    description: '국가를 당사자로 하는 계약에 관한 법률·시행령·시행규칙 및 기획재정부 계약예규',
  },
  {
    code: 'LOCAL_GOVERNMENT_CONTRACT',
    label: '지방자치단체 계약 법령',
    description: '지방자치단체를 당사자로 하는 계약에 관한 법률·시행령·시행규칙 및 행정안전부 예규',
  },
  {
    code: 'PUBLIC_INSTITUTION_RULES',
    label: '공공기관·발주기관별 계약규정',
    description: '공기업·준정부기관 계약사무규칙, LH 공사계약일반조건·특수조건 및 내부 지침',
  },
  {
    code: 'CONSTRUCTION_INDUSTRY_REG',
    label: '건설산업 기본 규제',
    description: '건설산업기본법·시행령·시행규칙 (등록기준, 직접시공, 일괄하도급 제한 등)',
  },
  {
    code: 'CONSTRUCTION_TECH_QUALITY',
    label: '건설기술 및 품질·안전관리',
    description: '건설기술 진흥법령 (품질관리계획, 안전관리계획, 설계변경·감리 기준 등)',
  },
  {
    code: 'OCCUPATIONAL_SAFETY_SAPA',
    label: '산업안전보건 및 중대재해 의무',
    description: '산업안전보건법령 및 중대재해 처벌 등에 관한 법률 (공사금액·시기별 경과조치 포함)',
  },
  {
    code: 'BUILDING_AND_PERMITS',
    label: '건축·주택 및 인허가 요건',
    description: '건축법, 주택법, 국토의 계획 및 이용에 관한 법률 등 인허가·착공·사용승인 기준',
  },
  {
    code: 'SUBCONTRACTING_PAYMENT',
    label: '하도급 및 대금지급 의무',
    description: '하도급거래 공정화에 관한 법률 및 건설산업기본법상 하도급대금 직불·지급보증 의무',
  },
  {
    code: 'LABOR_SITE_OBLIGATIONS',
    label: '현장 노무·고용 관련 의무',
    description: '근로기준법, 건설근로자의 고용개선 등에 관한 법률(전자카드제 등), 임금 구분지급',
  },
  {
    code: 'ENVIRONMENTAL_WASTE_NOISE',
    label: '환경·건설폐기물·소음진동 규제',
    description: '건설폐기물의 재활용촉진에 관한 법률, 소음·진동관리법, 대기환경보전법 등 현장 소재지 규제',
  },
  {
    code: 'ELECTRONIC_PROCUREMENT',
    label: '전자조달 및 입찰 절차',
    description: '전자조달의 이용 및 촉진에 관한 법률, 나라장터·이지비즈 전자입찰 특별유의서',
  },
  {
    code: 'LOCAL_ORDINANCES',
    label: '관할 지방자치단체 조례·규칙',
    description: '현장 소재지 및 발주 지자체 계약·지역건설산업 활성화·환경·교통 관련 조례',
  },
  {
    code: 'PROCUREMENT_NOTICE_CONDITIONS',
    label: '입찰공고문·계약조건·시방서 편입문서',
    description: '당해 공사 입찰공고문, 공사계약일반조건·특수조건, 현장설명서, 일반·특기시방서',
  },
];

export const RESEARCH_CATEGORY_LABELS: Record<ResearchCategoryCode, string> = Object.fromEntries(
  RESEARCH_CATEGORIES.map((c) => [c.code, c.label])
) as Record<ResearchCategoryCode, string>;

export enum ProjectEventType {
  TENDER_ANNOUNCEMENT = 'TENDER_ANNOUNCEMENT',
  BID_SUBMISSION_AND_AWARD = 'BID_SUBMISSION_AND_AWARD',
  CONTRACT_EXECUTION = 'CONTRACT_EXECUTION',
  SUBSEQUENT_ANNUAL_CONTRACT = 'SUBSEQUENT_ANNUAL_CONTRACT',
  PERMIT_AND_APPROVAL = 'PERMIT_AND_APPROVAL',
  ACTUAL_COMMENCEMENT = 'ACTUAL_COMMENCEMENT',
  WORK_ACTIVITY_OR_VIOLATION = 'WORK_ACTIVITY_OR_VIOLATION',
  DESIGN_CHANGE_INSTRUCTION_APPROVAL = 'DESIGN_CHANGE_INSTRUCTION_APPROVAL',
  PRICE_ADJUSTMENT_EVENT_REQUEST = 'PRICE_ADJUSTMENT_EVENT_REQUEST',
  SUSPENSION_AND_RESUMPTION = 'SUSPENSION_AND_RESUMPTION',
  EXTENSION_REQUEST_APPROVAL = 'EXTENSION_REQUEST_APPROVAL',
  COMPLETION_INSPECTION_HANDOVER_PAYMENT = 'COMPLETION_INSPECTION_HANDOVER_PAYMENT',
  DEFECT_AND_WARRANTY = 'DEFECT_AND_WARRANTY',
  CUSTOM_EVENT = 'CUSTOM_EVENT',
}

export const PROJECT_EVENT_TYPE_LABELS: Record<ProjectEventType, string> = {
  [ProjectEventType.TENDER_ANNOUNCEMENT]: '입찰공고 (최초·정정공고)',
  [ProjectEventType.BID_SUBMISSION_AND_AWARD]: '입찰서 제출 및 낙찰자 결정',
  [ProjectEventType.CONTRACT_EXECUTION]: '최초 도급계약 체결',
  [ProjectEventType.SUBSEQUENT_ANNUAL_CONTRACT]: '차수별 연차계약 체결 (장기계속)',
  [ProjectEventType.PERMIT_AND_APPROVAL]: '인허가 신청 및 승인',
  [ProjectEventType.ACTUAL_COMMENCEMENT]: '실착공 (착공신고·현장착수)',
  [ProjectEventType.WORK_ACTIVITY_OR_VIOLATION]: '대상 시공행위 또는 위반 혐의 발생',
  [ProjectEventType.DESIGN_CHANGE_INSTRUCTION_APPROVAL]: '설계변경 지시 및 승인',
  [ProjectEventType.PRICE_ADJUSTMENT_EVENT_REQUEST]: '물가변동 기준시점 도래 및 조정청구',
  [ProjectEventType.SUSPENSION_AND_RESUMPTION]: '공사 일시정지 및 재개',
  [ProjectEventType.EXTENSION_REQUEST_APPROVAL]: '계약기간(공기) 연장 청구 및 승인',
  [ProjectEventType.COMPLETION_INSPECTION_HANDOVER_PAYMENT]: '준공·검사·인수 및 대가지급',
  [ProjectEventType.DEFECT_AND_WARRANTY]: '하자 발생 및 하자담보책임 이벤트',
  [ProjectEventType.CUSTOM_EVENT]: '기타 사용자 정의 이벤트',
};

export enum DatePrecision {
  EXACT_DAY = 'EXACT_DAY',
  MONTH_ONLY = 'MONTH_ONLY',
  RANGE = 'RANGE',
  UNKNOWN = 'UNKNOWN',
}

export const DATE_PRECISION_LABELS: Record<DatePrecision, string> = {
  [DatePrecision.EXACT_DAY]: '일(日) 단위 확정 (YYYY-MM-DD)',
  [DatePrecision.MONTH_ONLY]: '월(月) 단위만 확인 (일 미상)',
  [DatePrecision.RANGE]: '기간 범위로만 확인',
  [DatePrecision.UNKNOWN]: '일자 미상 (추정 금지)',
};

export enum EventConfirmationStatus {
  CONFIRMED = 'CONFIRMED',
  CANDIDATE_UNCONFIRMED = 'CANDIDATE_UNCONFIRMED',
  DISPUTED = 'DISPUTED',
  UNKNOWN = 'UNKNOWN',
}

export const EVENT_CONFIRMATION_LABELS: Record<EventConfirmationStatus, string> = {
  [EventConfirmationStatus.CONFIRMED]: '사실 확인 완료',
  [EventConfirmationStatus.CANDIDATE_UNCONFIRMED]: '추출 후보 (담당자 확인 전)',
  [EventConfirmationStatus.DISPUTED]: '발주처·시공사 간 시점 다툼 있음',
  [EventConfirmationStatus.UNKNOWN]: '미확인 (근거문서 미확보)',
};

// 1. Project Model
export interface Project {
  id: string;
  projectCode: string;
  projectName: string;
  workspaceMode: WorkspaceMode;
  syntheticWarning?: string;
  contractingPrincipal: string; // 발주처(계약주체)
  institutionCategory: InstitutionCategory;
  procurementAgency: string; // 조달 대행기관 (예: 조달청 / 자체발주)
  contractAdministrator: string; // 계약담당/관리주체
  supervisingAuthority: string; // 감독기관/주무부처
  projectLocation: string;
  localGovernment: string; // 관할 지자체
  constructionType: string;
  constructionScope: string;
  contractorRole: ContractorRole;
  contractMethod: string;
  contractStructure: string;
  longTermStructureType: LongTermStructureType;
  totalContractAmountKrw: number | null;
  vatTreatment: VatTreatment;
  amendmentHistorySummary: string;
  governingLawInfo: string;
  incorporatedDocuments: Array<{
    title: string;
    versionOrEffectiveDate: string;
    incorporationBasis: string;
    verified: boolean;
  }>;
  contractingRegimeStatus: ContractingRegimeStatus;
  contractingRegimeValue: ContractingRegimeValue;
  contractingRegimeVerificationNote: string;
  siteManager: string;
  contractManager: string;
  legalReviewer: string;
  researchCutoffDate: string; // YYYY-MM-DD
  selectedResearchCategories: ResearchCategoryCode[];
  assignedUserIds: string[];
  createdAt: string;
  updatedAt: string;
}

// 2. ProjectEvent Model
export interface ProjectEvent {
  id: string;
  projectId: string;
  workspaceMode: WorkspaceMode;
  eventType: ProjectEventType;
  eventTitle: string;
  eventDate: string | null; // YYYY-MM-DD or null when unknown
  datePrecision: DatePrecision;
  dateRangeEnd: string | null;
  sourceDocumentId: string | null;
  pageOrSectionRef: string;
  confirmationStatus: EventConfirmationStatus;
  confirmedBy: string | null;
  confirmedAt: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export enum DocumentCategory {
  TENDER_NOTICE = 'TENDER_NOTICE',
  EXECUTED_CONTRACT = 'EXECUTED_CONTRACT',
  GENERAL_SPECIAL_CONDITIONS = 'GENERAL_SPECIAL_CONDITIONS',
  AGENCY_CONTRACT_REGULATION = 'AGENCY_CONTRACT_REGULATION',
  DESIGN_CHANGE_DOC = 'DESIGN_CHANGE_DOC',
  PRICE_ADJUSTMENT_CORRESPONDENCE = 'PRICE_ADJUSTMENT_CORRESPONDENCE',
  SITE_INSTRUCTION = 'SITE_INSTRUCTION',
  PERMIT_DOC = 'PERMIT_DOC',
  MEETING_RECORD = 'MEETING_RECORD',
  EXISTING_LEGAL_OPINION = 'EXISTING_LEGAL_OPINION',
  OFFICIAL_HISTORICAL_LAW_DOC = 'OFFICIAL_HISTORICAL_LAW_DOC',
}

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  [DocumentCategory.TENDER_NOTICE]: '입찰공고문',
  [DocumentCategory.EXECUTED_CONTRACT]: '체결 도급계약서 (연차계약서 포함)',
  [DocumentCategory.GENERAL_SPECIAL_CONDITIONS]: '공사계약 일반조건·특수조건',
  [DocumentCategory.AGENCY_CONTRACT_REGULATION]: '발주기관 자체 계약규정·지침',
  [DocumentCategory.DESIGN_CHANGE_DOC]: '설계변경 지시서·실정보고·승인서',
  [DocumentCategory.PRICE_ADJUSTMENT_CORRESPONDENCE]: '물가변동(ESC) 계약금액 조정 공문·산출내역',
  [DocumentCategory.SITE_INSTRUCTION]: '현장 작업지시서·감리지시서',
  [DocumentCategory.PERMIT_DOC]: '인허가증·착공신고필증·승인서',
  [DocumentCategory.MEETING_RECORD]: '공정회의록·발주처 협의록',
  [DocumentCategory.EXISTING_LEGAL_OPINION]: '기존 법률자문의견서·유권해석 회신',
  [DocumentCategory.OFFICIAL_HISTORICAL_LAW_DOC]: '공식 연혁 법령·예규·조례 원문 파일',
};

// 3. Document Model
export interface Document {
  id: string;
  projectId: string;
  workspaceMode: WorkspaceMode;
  documentCategory: DocumentCategory;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  fileHashSha256: string;
  rawContentText: string; // Untrusted evidence text
  uploaderId: string;
  uploaderName: string;
  uploadedAt: string;
  hasStablePagination: boolean;
  pageCount: number | null;
  extractionMethod: 'TEXT_LAYER_PARSE' | 'SERVER_OCR' | 'MANUAL_ENTRY' | 'UNREADABLE_SCAN_FLAGGED';
  ocrLimitationNote: string;
  isUnreadableScan: boolean;
  userCorrectionsLog: Array<{
    field: string;
    before: string;
    after: string;
    correctedBy: string;
    correctedAt: string;
  }>;
}

// 4. Fact Model
export interface Fact {
  id: string;
  projectId: string;
  workspaceMode: WorkspaceMode;
  factCategory:
    | 'DATE'
    | 'INSTITUTION_REGIME'
    | 'AMOUNT_THRESHOLD'
    | 'CONTRACT_CONDITION'
    | 'SCOPE_LOCATION'
    | 'PARTY_ROLE'
    | 'EVENT_TRIGGER';
  factKey: string;
  label: string;
  value: string;
  numericValue: number | null;
  dateValue: string | null;
  precision: 'EXACT' | 'APPROXIMATE' | 'UNKNOWN';
  sourceDocumentId: string | null;
  pageOrSectionAnchor: string;
  paginationAvailable: boolean;
  verbatimExcerpt: string;
  status: 'CANDIDATE' | 'CONFIRMED' | 'REJECTED';
  extractedBy: 'DETERMINISTIC_PARSER' | 'GEMINI_PROPOSAL' | 'MANUAL_USER';
  confirmedBy: string | null;
  confirmedAt: string | null;
  updatedAt: string;
}

export type SourceCategory =
  | 'STATUTE'
  | 'ENFORCEMENT_DECREE'
  | 'ENFORCEMENT_RULE'
  | 'ADMINISTRATIVE_RULE'
  | 'LOCAL_ORDINANCE'
  | 'CONTRACT_GENERAL_CONDITIONS'
  | 'AGENCY_INTERNAL_RULE'
  | 'PRECEDENT_OR_INTERPRETATION';

export const SOURCE_CATEGORY_LABELS: Record<SourceCategory, string> = {
  STATUTE: '법률 (Statute)',
  ENFORCEMENT_DECREE: '대통령령·시행령 (Enforcement Decree)',
  ENFORCEMENT_RULE: '총리령·부령·시행규칙 (Enforcement Rule)',
  ADMINISTRATIVE_RULE: '행정규칙·계약예규·고시·훈령 (Administrative Rule)',
  LOCAL_ORDINANCE: '지방자치단체 조례·규칙 (Local Ordinance)',
  CONTRACT_GENERAL_CONDITIONS: '편입 계약조건 (공사계약일반조건·특수조건)',
  AGENCY_INTERNAL_RULE: '발주기관 내부규정·지침 (LH 사규 등)',
  PRECEDENT_OR_INTERPRETATION: '대법원 판례·법제처·기재부·행안부 유권해석',
};

// 5. SourceRecord Model
export interface SourceRecord {
  id: string; // Application-generated ID
  officialSourceId: string; // Official Law ID / MST / Ordinance ID (stored separately)
  workspaceMode: WorkspaceMode;
  syntheticLabel?: string; // Must be "가상 예시 — 법률 판단에 사용 금지" for demo records
  connectorId:
    | 'MOLEG_OPEN_API'
    | 'AGENCY_AUTHENTICATED_UPLOAD'
    | 'MANUAL_OFFICIAL_URL'
    | 'LAWNB_OPTIONAL'
    | 'SYNTHETIC_DEMO_FIXTURE';
  sourceCategory: SourceCategory;
  officialTitle: string;
  issuingAuthority: string;
  officialUrlOrFileRef: string;
  retrievedAt: string; // Asia/Seoul retrieval timestamp (never confused with effectiveDate)
  hasFullHistoricalText: boolean;
  missingAttachments: string[];
}

// 6. LegalInstrument Model
export interface LegalInstrument {
  id: string; // Application-generated ID
  officialInstrumentId: string; // Official Law ID
  workspaceMode: WorkspaceMode;
  officialTitle: string;
  sourceCategory: SourceCategory;
  issuingAuthority: string;
  researchCategory: ResearchCategoryCode;
  governingRegimeScope: ContractingRegimeValue[];
}

// 7. ProvisionVersion Model
export interface ProvisionVersion {
  id: string; // Application-generated ID
  instrumentId: string;
  sourceRecordId: string;
  officialMstOrVersionId: string; // Official version / MST identifier
  workspaceMode: WorkspaceMode;
  syntheticLabel?: string;
  officialDocumentTitle: string;
  sourceCategory: SourceCategory;
  issuingAuthority: string;
  articleNumber: string; // e.g., "제19조제1항", "제64조제1항제1호"
  articleTitle: string;
  promulgationDate: string | null; // 공포일 YYYY-MM-DD
  generalEffectiveDate: string | null; // 법령 일반 시행일 YYYY-MM-DD
  provisionEffectiveDate: string | null; // 해당 조문 개별 시행일 YYYY-MM-DD (단일 개정 내 조문별 상이 가능)
  validUntilDate: string | null; // 개정 전 조문 유효 종료일
  amendmentType: string; // 일부개정, 타법개정 등
  amendmentNumber: string; // 예: 법률 제19500호
  verbatimKoreanText: string; // 원문 그대로 보존 (미확보 시 빈 문자열 + isHistoricalTextMissing: true)
  isHistoricalTextMissing: boolean; // true일 경우 "해당 시점 원문 미확보" 표시 및 현행 법령 대체 금지
  supplementaryProvisionsText: string; // 부칙 원문
  applicationClauseText: string; // 적용례 원문
  transitionalProvisionText: string; // 경과조치 원문
  referencedAttachments: Array<{
    title: string; // 예: "별표 1", "별지 제4호서식"
    status: 'AVAILABLE' | 'MISSING';
    contentOrReason: string;
  }>;
  precedentOrInterpretationDependency: {
    required: boolean;
    description: string;
    authoritySourceRetrieved: boolean;
    citationText?: string;
  };
  priorVersionId: string | null;
}

// 8. ApplicabilityRule Model
export interface ApplicabilityRule {
  id: string;
  provisionVersionId: string;
  workspaceMode: WorkspaceMode;
  ruleName: string;
  issueTitle: string;
  researchCategory: ResearchCategoryCode;
  approvalStatus: 'PROPOSED_BY_AI' | 'VERIFIED_BY_HUMAN' | 'REJECTED';
  approvedBy: string | null;
  approvedAt: string | null;
  targetEventTypes: ProjectEventType[];
  requiredRegimes: ContractingRegimeValue[];
  excludedRegimes: ContractingRegimeValue[];
  minThresholdAmountKrw: number | null;
  maxThresholdAmountKrw: number | null;
  requiredLocationKeywords: string[];
  effectiveDateTriggerType:
    | 'CONTRACT_EXECUTION_DATE'
    | 'TENDER_ANNOUNCEMENT_DATE'
    | 'EVENT_FACTUAL_TRIGGER_DATE'
    | 'SUBSEQUENT_ANNUAL_CONTRACT_DATE'
    | 'COMMENCEMENT_DATE';
  boundaryComparison: 'ON_OR_AFTER' | 'STRICTLY_AFTER' | 'ON_OR_BEFORE';
  referenceBoundaryDate: string; // YYYY-MM-DD
  hasTransitionalPreservationOfPriorRule: boolean;
  preservedPriorProvisionVersionId: string | null;
  transitionalConditionDescription: string;
  requiresPrecedentOrInterpretation: boolean;
}

export type ApplicabilityStatus =
  | '적용 후보'
  | '적용 근거 확인'
  | '비적용 근거 확인'
  | '추가 사실 확인 필요'
  | '부칙·경과조치 검토 필요'
  | '원문 확보 필요'
  | '법무 검토 완료'
  | '재검토 필요';

export type LegalReviewConclusion =
  | '적용'
  | '비적용'
  | '조건부 적용(경과조치·종전규정)'
  | '판단 보류(추가 사실·원문 확보 필요)'
  | null;

// 9. ApplicabilityAssessment Model
export interface ApplicabilityAssessment {
  id: string;
  projectId: string;
  eventId: string;
  provisionVersionId: string;
  ruleId: string | null;
  workspaceMode: WorkspaceMode;
  syntheticLabel?: string;
  researchCategory: ResearchCategoryCode;
  issueTitle: string;
  referenceDateUsed: string | null; // 기준일
  referenceDateTypeLabel: string; // 예: "설계변경 지시일(사실발생일)" vs "최초 도급계약 체결일"
  status: ApplicabilityStatus;
  legalReviewConclusion: LegalReviewConclusion;
  stageARetrievalSummary: string;
  stageBEvaluation: {
    subjectMatterMatch: string;
    institutionRegimeCheck: string;
    projectContractTypeCheck: string;
    locationCheck: string;
    thresholdCheck: string;
    effectiveDateBoundaryCheck: string;
    applicationAndTransitionalCheck: string;
    incorporatedConditionsCheck: string;
  };
  verbatimSourceExcerpt: string; // 원문 그대로 보존 (AI 생성 문장과 분리)
  modelOrRuleAnalysisText: string; // 사실관계와 조문 연결 설명 (원문과 분리)
  supplementaryAndTransitionalAnalysis: string; // 부칙·경과조치 검토 상세
  unresolvedIssues: string[]; // 미확인 사항
  evidenceCompleteness: {
    hasConfirmedEventDate: boolean;
    hasVerifiedRegime: boolean;
    hasVerbatimHistoricalText: boolean;
    hasCompleteAttachments: boolean;
    hasResolvedTransitionalClause: boolean;
    hasRequiredPrecedent: boolean;
    summaryLabel: string; // 수치형 AI 신뢰도 점수 대신 증거 완결성 상태 표시
  };
  dependentFactIds: string[];
  dependentProvisionVersionIds: string[];
  affectedByLaterAmendment: boolean;
  laterAmendmentNote: string | null;
  assignedReviewer: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// 10. ReviewDecision Model
export interface ReviewDecision {
  id: string;
  assessmentId: string;
  projectId: string;
  workspaceMode: WorkspaceMode;
  decisionType:
    | 'APPROVE_CONCLUSION'
    | 'REJECT_ANALYSIS'
    | 'REQUEST_MORE_FACTS'
    | 'FLAG_TRANSITIONAL_REVIEW';
  resultingStatus: ApplicabilityStatus;
  recordedConclusion: LegalReviewConclusion;
  reasonText: string;
  reviewerId: string;
  reviewerName: string;
  reviewerRole: UserRole;
  decidedAt: string;
}

// 11. AuditEvent Model
export interface AuditEvent {
  id: string;
  workspaceMode: WorkspaceMode;
  projectId: string | null;
  eventType:
    | 'FACT_CHANGE'
    | 'SOURCE_RETRIEVAL'
    | 'RULE_APPROVAL'
    | 'ASSESSMENT_CREATED'
    | 'ASSESSMENT_INVALIDATED'
    | 'LEGAL_REVIEW_DECISION'
    | 'REPORT_EXPORT'
    | 'UNAUTHORIZED_ACCESS_BLOCKED'
    | 'POLICY_CHANGE';
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  targetEntityType: string;
  targetEntityId: string;
  summary: string;
  beforeSnapshot: string | null;
  afterSnapshot: string | null;
  createdAt: string;
}

// 12. ExportRecord Model
export interface ExportRecord {
  id: string;
  projectId: string;
  workspaceMode: WorkspaceMode;
  exportFormat: 'XLSX_MATRIX' | 'DOCX_REPORT' | 'PRINT_PDF_VIEW';
  selectedEventIds: string[];
  researchCutoffDate: string;
  generatedAt: string;
  generatedBy: string;
  approvalStatusBanner: '법무 검토 완료' | '법무 검토 전';
  unresolvedIssueCount: number;
}

export interface ConnectorStatusInfo {
  connectorId: string;
  name: string;
  provider: string;
  status: 'CONNECTED' | 'UNCONFIGURED_LIVE_API' | 'DISABLED_BY_LICENSE_POLICY' | 'MANUAL_READY' | 'ERROR';
  statusLabel: string;
  availableCategories: Array<{
    category: SourceCategory;
    label: string;
    supported: boolean;
    coverageNote: string;
  }>;
  lastSuccessfulRetrievalAt: string | null;
  authRequirementText: string;
  historicalCoverageLimitations: string;
  lastFailureMessage: string | null;
}

export interface GovernancePolicySettings {
  allowExternalAiContractProcessing: boolean;
  amendmentMonitoringMode: 'MANUAL_ON_DEMAND' | 'SCHEDULED_SERVER_CRON';
  schedulerConfigured: boolean;
  retentionDays: number;
  privateStorageEnforced: boolean;
}
