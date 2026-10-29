import React, { useState } from 'react';
import {
  CONTRACTING_REGIME_STATUS_LABELS,
  CONTRACTING_REGIME_VALUE_LABELS,
  CONTRACTOR_ROLE_LABELS,
  ContractingRegimeStatus,
  ContractingRegimeValue,
  ContractorRole,
  DATE_PRECISION_LABELS,
  DatePrecision,
  DOCUMENT_CATEGORY_LABELS,
  Document,
  DocumentCategory,
  EVENT_CONFIRMATION_LABELS,
  EventConfirmationStatus,
  INSTITUTION_CATEGORY_LABELS,
  InstitutionCategory,
  LONG_TERM_STRUCTURE_LABELS,
  LongTermStructureType,
  Project,
  PROJECT_EVENT_TYPE_LABELS,
  ProjectEventType,
  ProvisionVersion,
  RESEARCH_CATEGORIES,
  ResearchCategoryCode,
  SOURCE_CATEGORY_LABELS,
  SourceCategory,
  VAT_TREATMENT_LABELS,
  VatTreatment,
  WorkspaceMode,
} from '../types/legalDomain.ts';
import { SYNTHETIC_WARNING_LABEL } from '../data/seedData.ts';

interface NewProjectModalProps {
  isOpen: boolean;
  workspaceMode: WorkspaceMode;
  onClose: () => void;
  onSubmit: (payload: Partial<Project>) => Promise<void>;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  isOpen,
  workspaceMode,
  onClose,
  onSubmit,
}) => {
  const [projectCode, setProjectCode] = useState(
    workspaceMode === WorkspaceMode.DEMO ? 'DEMO-2026-003' : 'PRJ-2026-PUB-009'
  );
  const [projectName, setProjectName] = useState('');
  const [contractingPrincipal, setContractingPrincipal] = useState('');
  const [institutionCategory, setInstitutionCategory] = useState<InstitutionCategory>(
    InstitutionCategory.PUBLIC_ENTERPRISE_LH
  );
  const [procurementAgency, setProcurementAgency] = useState('조달청 (나라장터 중앙조달 대행 여부 확인)');
  const [contractAdministrator, setContractAdministrator] = useState('');
  const [supervisingAuthority, setSupervisingAuthority] = useState('');
  const [projectLocation, setProjectLocation] = useState('');
  const [localGovernment, setLocalGovernment] = useState('');
  const [constructionType, setConstructionType] = useState('토목·건축 복합공사');
  const [constructionScope, setConstructionScope] = useState('');
  const [contractorRole, setContractorRole] = useState<ContractorRole>(
    ContractorRole.MAIN_CONTRACTOR
  );
  const [contractMethod, setContractMethod] = useState('종합심사낙찰제');
  const [contractStructure, setContractStructure] = useState('장기계속공사 (연차별 차수계약)');
  const [longTermStructureType, setLongTermStructureType] = useState<LongTermStructureType>(
    LongTermStructureType.LONG_TERM_CONTINUING
  );
  const [totalContractAmountStr, setTotalContractAmountStr] = useState('45000000000');
  const [vatTreatment, setVatTreatment] = useState<VatTreatment>(VatTreatment.VAT_INCLUDED);
  const [amendmentHistorySummary, setAmendmentHistorySummary] = useState('');
  const [governingLawInfo, setGoverningLawInfo] = useState('');
  const [incorporatedTitle, setIncorporatedTitle] = useState('공사계약일반조건 (편입 버전 확인 필요)');
  const [incorporatedVersion, setIncorporatedVersion] = useState('계약 체결 당시 시행본');
  const [contractingRegimeStatus, setContractingRegimeStatus] = useState<ContractingRegimeStatus>(
    ContractingRegimeStatus.UNRESOLVED
  );
  const [contractingRegimeValue, setContractingRegimeValue] = useState<ContractingRegimeValue>(
    ContractingRegimeValue.UNRESOLVED
  );
  const [contractingRegimeVerificationNote, setContractingRegimeVerificationNote] = useState(
    '발주기관 명칭이나 조달청 대행 여부만으로 국가계약법 적용을 단정하지 않으며, 실제 계약서 제2조·제3조 편입 규정 원문 확인 후 확정 예정'
  );
  const [siteManager, setSiteManager] = useState('이현장 소장');
  const [contractManager, setContractManager] = useState('박공무 차장');
  const [legalReviewer, setLegalReviewer] = useState('김법무 수석변호사');
  const [researchCutoffDate, setResearchCutoffDate] = useState('2026-10-21');
  const [selectedCategories, setSelectedCategories] = useState<ResearchCategoryCode[]>([
    'NATIONAL_PUBLIC_CONTRACT',
    'LOCAL_GOVERNMENT_CONTRACT',
    'PUBLIC_INSTITUTION_RULES',
    'CONSTRUCTION_INDUSTRY_REG',
    'OCCUPATIONAL_SAFETY_SAPA',
    'SUBCONTRACTING_PAYMENT',
    'PROCUREMENT_NOTICE_CONDITIONS',
  ]);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const toggleCategory = (code: ResearchCategoryCode) => {
    setSelectedCategories((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim() || !contractingPrincipal.trim()) return;
    setSubmitting(true);
    try {
      const parsedAmount = totalContractAmountStr.trim()
        ? Number(totalContractAmountStr.replace(/,/g, ''))
        : null;
      await onSubmit({
        workspaceMode,
        projectCode,
        projectName,
        contractingPrincipal,
        institutionCategory,
        procurementAgency,
        contractAdministrator,
        supervisingAuthority,
        projectLocation,
        localGovernment,
        constructionType,
        constructionScope,
        contractorRole,
        contractMethod,
        contractStructure,
        longTermStructureType,
        totalContractAmountKrw: Number.isNaN(parsedAmount) ? null : parsedAmount,
        vatTreatment,
        amendmentHistorySummary,
        governingLawInfo,
        incorporatedDocuments: incorporatedTitle.trim()
          ? [
              {
                title: incorporatedTitle.trim(),
                versionOrEffectiveDate: incorporatedVersion.trim() || '버전 미확인',
                incorporationBasis: '도급계약서 편입 약정',
                verified: contractingRegimeStatus === ContractingRegimeStatus.VERIFIED,
              },
            ]
          : [],
        contractingRegimeStatus,
        contractingRegimeValue,
        contractingRegimeVerificationNote,
        siteManager,
        contractManager,
        legalReviewer,
        researchCutoffDate,
        selectedResearchCategories: selectedCategories,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-lg">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              신규 공공공사 프로젝트 등록 (Project Intake)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              발주처(계약주체)와 조달 대행기관(조달청 등)을 엄격히 구분하고, 미확인된 법제 체계는 [미해결]로 등록합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded"
          >
            닫기
          </button>
        </div>

        {workspaceMode === WorkspaceMode.DEMO && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900 font-medium">
            [{SYNTHETIC_WARNING_LABEL}] 현재 데모 워크스페이스에서 가상 프로젝트를 생성합니다.
          </div>
        )}

        <form onSubmit={handleFormSubmit} className="mt-4 space-y-5 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block font-medium text-slate-700 mb-1">프로젝트 코드 *</label>
              <input
                type="text"
                required
                value={projectCode}
                onChange={(e) => setProjectCode(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded font-mono text-xs"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block font-medium text-slate-700 mb-1">공식 공사명 *</label>
              <input
                type="text"
                required
                placeholder="예: 과천주암 공공주택지구 C-1블록 건설공사 2공구"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-3 border-t border-slate-100">
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                발주처 (계약주체·Contracting Principal) *
              </label>
              <input
                type="text"
                required
                placeholder="예: 한국토지주택공사(LH) / 평택시청"
                value={contractingPrincipal}
                onChange={(e) => setContractingPrincipal(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded text-xs"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">발주기관 분류</label>
              <select
                value={institutionCategory}
                onChange={(e) => setInstitutionCategory(e.target.value as InstitutionCategory)}
                className="w-full px-3 py-2 border border-slate-300 rounded text-xs bg-white"
              >
                {Object.entries(INSTITUTION_CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                조달 대행기관 (계약주체와 다른 경우)
              </label>
              <input
                type="text"
                placeholder="예: 조달청 (중앙조달 대행) / 자체발주"
                value={procurementAgency}
                onChange={(e) => setProcurementAgency(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded text-xs"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                계약담당부서 및 감독기관
              </label>
              <input
                type="text"
                placeholder="예: LH 공정계약단 / 국토교통부"
                value={contractAdministrator}
                onChange={(e) => {
                  setContractAdministrator(e.target.value);
                  setSupervisingAuthority(e.target.value);
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-slate-100">
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                계약 법제 체계 확인 상태 (단정 금지)
              </label>
              <select
                value={contractingRegimeStatus}
                onChange={(e) =>
                  setContractingRegimeStatus(e.target.value as ContractingRegimeStatus)
                }
                className="w-full px-3 py-2 border border-slate-300 rounded text-xs bg-white"
              >
                {Object.entries(CONTRACTING_REGIME_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block font-medium text-slate-700 mb-1">
                적용 계약 법제 체계 (조달청 대행 여부만으로 국가계약법 자동 분류 금지)
              </label>
              <select
                value={contractingRegimeValue}
                onChange={(e) =>
                  setContractingRegimeValue(e.target.value as ContractingRegimeValue)
                }
                className="w-full px-3 py-2 border border-slate-300 rounded text-xs bg-white"
              >
                {Object.entries(CONTRACTING_REGIME_VALUE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-3 border-t border-slate-100">
            <div>
              <label className="block font-medium text-slate-700 mb-1">현장 소재지</label>
              <input
                type="text"
                placeholder="예: 경기도 과천시 주암동 일원"
                value={projectLocation}
                onChange={(e) => setProjectLocation(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded text-xs"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">관할 지방자치단체</label>
              <input
                type="text"
                placeholder="예: 경기도 과천시"
                value={localGovernment}
                onChange={(e) => setLocalGovernment(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded text-xs"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">시공자 지위(역할)</label>
              <select
                value={contractorRole}
                onChange={(e) => setContractorRole(e.target.value as ContractorRole)}
                className="w-full px-3 py-2 border border-slate-300 rounded text-xs bg-white"
              >
                {Object.entries(CONTRACTOR_ROLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">장기계속·계속비 구분</label>
              <select
                value={longTermStructureType}
                onChange={(e) => setLongTermStructureType(e.target.value as LongTermStructureType)}
                className="w-full px-3 py-2 border border-slate-300 rounded text-xs bg-white"
              >
                {Object.entries(LONG_TERM_STRUCTURE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-3 border-t border-slate-100">
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                총 도급계약금액 (원, 미상 시 비움)
              </label>
              <input
                type="text"
                value={totalContractAmountStr}
                onChange={(e) => setTotalContractAmountStr(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded font-mono text-xs"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">부가가치세 처리 기준</label>
              <select
                value={vatTreatment}
                onChange={(e) => setVatTreatment(e.target.value as VatTreatment)}
                className="w-full px-3 py-2 border border-slate-300 rounded text-xs bg-white"
              >
                {Object.entries(VAT_TREATMENT_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">편입 계약조건 문서명</label>
              <input
                type="text"
                value={incorporatedTitle}
                onChange={(e) => setIncorporatedTitle(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded text-xs"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                검토 기준일 (Research Cutoff)
              </label>
              <input
                type="date"
                value={researchCutoffDate}
                onChange={(e) => setResearchCutoffDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded font-mono text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-slate-100">
            <div>
              <label className="block font-medium text-slate-700 mb-1">담당 현장소장</label>
              <input
                type="text"
                value={siteManager}
                onChange={(e) => setSiteManager(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded text-xs"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">담당 계약·공무관리자</label>
              <input
                type="text"
                value={contractManager}
                onChange={(e) => setContractManager(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded text-xs"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">담당 법무 검토자</label>
              <input
                type="text"
                value={legalReviewer}
                onChange={(e) => setLegalReviewer(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded text-xs"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100">
            <label className="block font-medium text-slate-700 mb-2">
              후보 법령 검토 범위 설정 (선택된 분야가 무조건 적용됨을 의미하지 않으며 후보 탐색 범위임)
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {RESEARCH_CATEGORIES.map((cat) => {
                const checked = selectedCategories.includes(cat.code);
                return (
                  <label
                    key={cat.code}
                    className={`flex items-start gap-2 p-2 border rounded cursor-pointer ${
                      checked ? 'border-slate-800 bg-slate-50' : 'border-slate-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCategory(cat.code)}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="font-medium text-slate-900">{cat.label}</div>
                      <div className="text-[11px] text-slate-500">{cat.description}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded"
            >
              {submitting ? '등록 중...' : '프로젝트 생성 및 워크스페이스 열기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface AddEventModalProps {
  isOpen: boolean;
  documents: Document[];
  onClose: () => void;
  onSubmit: (payload: {
    eventType: ProjectEventType;
    eventTitle: string;
    eventDate: string | null;
    datePrecision: DatePrecision;
    sourceDocumentId: string | null;
    pageOrSectionRef: string;
    confirmationStatus: EventConfirmationStatus;
    notes: string;
  }) => Promise<void>;
}

export const AddEventModal: React.FC<AddEventModalProps> = ({
  isOpen,
  documents,
  onClose,
  onSubmit,
}) => {
  const [eventType, setEventType] = useState<ProjectEventType>(
    ProjectEventType.DESIGN_CHANGE_INSTRUCTION_APPROVAL
  );
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('2025-07-15');
  const [isDateUnknown, setIsDateUnknown] = useState(false);
  const [datePrecision, setDatePrecision] = useState<DatePrecision>(DatePrecision.EXACT_DAY);
  const [sourceDocumentId, setSourceDocumentId] = useState<string>(documents[0]?.id || '');
  const [pageOrSectionRef, setPageOrSectionRef] = useState('제2조 제1항 (페이지 또는 절·항 앵커)');
  const [confirmationStatus, setConfirmationStatus] = useState<EventConfirmationStatus>(
    EventConfirmationStatus.CONFIRMED
  );
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      eventType,
      eventTitle: eventTitle.trim() || PROJECT_EVENT_TYPE_LABELS[eventType],
      eventDate: isDateUnknown ? null : eventDate || null,
      datePrecision: isDateUnknown ? DatePrecision.UNKNOWN : datePrecision,
      sourceDocumentId: sourceDocumentId || null,
      pageOrSectionRef,
      confirmationStatus: isDateUnknown ? EventConfirmationStatus.UNKNOWN : confirmationStatus,
      notes,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="bg-white border border-slate-200 rounded-lg max-w-xl w-full p-6 shadow-lg">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <h3 className="text-base font-semibold text-slate-900">
            개별 공사 이벤트 및 기준 시점 등록
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1 text-xs text-slate-600 border border-slate-200 rounded"
          >
            닫기
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">공사 이벤트 유형 *</label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value as ProjectEventType)}
              className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
            >
              {Object.entries(PROJECT_EVENT_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">이벤트 상세 명칭 *</label>
            <input
              type="text"
              required
              placeholder="예: 제2회 설계변경 실정보고 승인 / 3차년도 연차계약 체결"
              value={eventTitle}
              onChange={(e) => setEventTitle(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded"
            />
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-3">
            <label className="flex items-center gap-2 font-medium text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={isDateUnknown}
                onChange={(e) => setIsDateUnknown(e.target.checked)}
              />
              <span>
                현재 정확한 발생 일자를 알 수 없음 (미상 'UNKNOWN'으로 보존 — 계약일 등으로 임의 대체 금지)
              </span>
            </label>

            {!isDateUnknown && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    발생 일자 (YYYY-MM-DD)
                  </label>
                  <input
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">일자 정밀도</label>
                  <select
                    value={datePrecision}
                    onChange={(e) => setDatePrecision(e.target.value as DatePrecision)}
                    className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
                  >
                    {Object.entries(DATE_PRECISION_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">근거 문서 연결</label>
              <select
                value={sourceDocumentId}
                onChange={(e) => setSourceDocumentId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
              >
                <option value="">근거 문서 미연결</option>
                {documents.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.originalFilename}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                페이지 번호 또는 절·항 앵커 *
              </label>
              <input
                type="text"
                required
                value={pageOrSectionRef}
                onChange={(e) => setPageOrSectionRef(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">사실 확인 상태</label>
            <select
              value={confirmationStatus}
              onChange={(e) => setConfirmationStatus(e.target.value as EventConfirmationStatus)}
              className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
            >
              {Object.entries(EVENT_CONFIRMATION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">비고 및 원문 발췌 메모</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-slate-600 border border-slate-200 rounded"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded"
            >
              이벤트 저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface UploadSourceModalProps {
  isOpen: boolean;
  workspaceMode: WorkspaceMode;
  existingProvisions: ProvisionVersion[];
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}

export const UploadHistoricalSourceModal: React.FC<UploadSourceModalProps> = ({
  isOpen,
  workspaceMode,
  existingProvisions,
  onClose,
  onSubmit,
}) => {
  const [sourceCategory, setSourceCategory] = useState<SourceCategory>('ENFORCEMENT_DECREE');
  const [officialDocumentTitle, setOfficialDocumentTitle] = useState(
    '지방자치단체를 당사자로 하는 계약에 관한 법률 시행령'
  );
  const [issuingAuthority, setIssuingAuthority] = useState('대통령령 (행정안전부)');
  const [officialSourceId, setOfficialSourceId] = useState('MST-271500');
  const [amendmentNumber, setAmendmentNumber] = useState('대통령령 제35120호');
  const [articleNumber, setArticleNumber] = useState('제74조제3항');
  const [articleTitle, setArticleTitle] = useState('설계변경으로 인한 계약금액의 조정');
  const [promulgationDate, setPromulgationDate] = useState('2025-05-10');
  const [generalEffectiveDate, setGeneralEffectiveDate] = useState('2025-07-01');
  const [provisionEffectiveDate, setProvisionEffectiveDate] = useState('2025-09-01');
  const [priorVersionId, setPriorVersionId] = useState<string>(
    existingProvisions[0]?.id || ''
  );
  const [verbatimKoreanText, setVerbatimKoreanText] = useState(
    '제74조(설계변경으로 인한 계약금액의 조정) ③ 지방자치단체의 장 또는 계약담당자가 설계변경을 요구한 경우 증가된 물량 또는 신규비목의 단가는 설계변경 지시 당시를 기준으로 산정한 단가와 동 단가에 낙찰률을 곱한 금액의 범위 안에서 협의하여 결정한다.'
  );
  const [supplementaryProvisionsText, setSupplementaryProvisionsText] = useState(
    '부칙 <제35120호, 2025. 5. 10.> 제1조(시행일) 이 영은 2025년 7월 1일부터 시행한다. 다만, 제74조제3항의 개정규정은 2025년 9월 1일부터 시행한다.'
  );
  const [transitionalProvisionText, setTransitionalProvisionText] = useState(
    '제3조(경과조치) 2025년 9월 1일 전에 입찰공고를 하거나 계약을 체결한 공사에 관하여는 종전의 규정에 따른다.'
  );
  const [officialUrlOrFileRef, setOfficialUrlOrFileRef] = useState(
    'https://www.law.go.kr/DRF/lawService.do?target=eflaw'
  );

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      workspaceMode,
      sourceCategory,
      officialDocumentTitle,
      issuingAuthority,
      officialSourceId,
      officialMstOrVersionId: `${amendmentNumber} (${officialSourceId})`,
      amendmentNumber,
      articleNumber,
      articleTitle,
      promulgationDate,
      generalEffectiveDate,
      provisionEffectiveDate,
      priorVersionId: priorVersionId || null,
      verbatimKoreanText,
      supplementaryProvisionsText,
      applicationClauseText: supplementaryProvisionsText,
      transitionalProvisionText,
      hasTransitionalPreservationOfPriorRule: transitionalProvisionText.includes('종전의 규정'),
      officialUrlOrFileRef,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-lg">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              공식 연혁 법령·예규·계약조건 원문 수동 등록
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              공포일, 일반 시행일, 조문별 개별 시행일, 부칙(적용례·경과조치) 및 원문을 분리 보존합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1 text-xs text-slate-600 border border-slate-200 rounded"
          >
            닫기
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">법원(Source) 구분</label>
              <select
                value={sourceCategory}
                onChange={(e) => setSourceCategory(e.target.value as SourceCategory)}
                className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
              >
                {Object.entries(SOURCE_CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block font-medium text-slate-700 mb-1">공식 법령·문서 제명 *</label>
              <input
                type="text"
                required
                value={officialDocumentTitle}
                onChange={(e) => setOfficialDocumentTitle(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">발령·소관기관</label>
              <input
                type="text"
                value={issuingAuthority}
                onChange={(e) => setIssuingAuthority(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">공포·발령번호</label>
              <input
                type="text"
                value={amendmentNumber}
                onChange={(e) => setAmendmentNumber(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">공식 식별자(MST/ID)</label>
              <input
                type="text"
                value={officialSourceId}
                onChange={(e) => setOfficialSourceId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">조문 번호 (조·항·호)</label>
              <input
                type="text"
                value={articleNumber}
                onChange={(e) => setArticleNumber(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 bg-slate-50 border border-slate-200 rounded">
            <div>
              <label className="block font-medium text-slate-700 mb-1">공포일 (Promulgation)</label>
              <input
                type="date"
                value={promulgationDate}
                onChange={(e) => setPromulgationDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded font-mono bg-white"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                법령 일반 시행일 (General Effective)
              </label>
              <input
                type="date"
                value={generalEffectiveDate}
                onChange={(e) => setGeneralEffectiveDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded font-mono bg-white"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                당해 조문 개별 시행일 (단서 시행일)
              </label>
              <input
                type="date"
                value={provisionEffectiveDate}
                onChange={(e) => setProvisionEffectiveDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded font-mono bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                직전 구(舊) 조문 버전 연결 (신·구 대조 및 개정 영향 감지용)
              </label>
              <select
                value={priorVersionId}
                onChange={(e) => setPriorVersionId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
              >
                <option value="">선행 버전 없음 (제정 또는 단독 등록)</option>
                {existingProvisions.map((pv) => (
                  <option key={pv.id} value={pv.id}>
                    {pv.officialDocumentTitle} {pv.articleNumber} ({pv.amendmentNumber})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                공식 출처 URL (허용 도메인 SSRF 검증) 또는 파일 참조명
              </label>
              <input
                type="text"
                value={officialUrlOrFileRef}
                onChange={(e) => setOfficialUrlOrFileRef(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              조문 한국어 원문 (Verbatim Text — 미확보 시 비워두면 자동으로 '해당 시점 원문 미확보' 처리됨)
            </label>
            <textarea
              rows={3}
              value={verbatimKoreanText}
              onChange={(e) => setVerbatimKoreanText(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                부칙 시행일 및 적용례 조문 원문
              </label>
              <textarea
                rows={2}
                value={supplementaryProvisionsText}
                onChange={(e) => setSupplementaryProvisionsText(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                부칙 경과조치 원문 (종전 규정 적용 여부)
              </label>
              <textarea
                rows={2}
                value={transitionalProvisionText}
                onChange={(e) => setTransitionalProvisionText(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-slate-600 border border-slate-200 rounded"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded"
            >
              공식 연혁 조문 및 부칙 등록
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
