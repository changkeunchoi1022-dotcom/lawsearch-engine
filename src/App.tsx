import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApplicabilityAssessment,
  ApplicabilityRule,
  ApplicabilityStatus,
  AppUser,
  AuditEvent,
  ConnectorStatusInfo,
  CONTRACTING_REGIME_STATUS_LABELS,
  CONTRACTING_REGIME_VALUE_LABELS,
  CONTRACTOR_ROLE_LABELS,
  ContractingRegimeStatus,
  ContractingRegimeValue,
  DATE_PRECISION_LABELS,
  DatePrecision,
  DOCUMENT_CATEGORY_LABELS,
  Document,
  DocumentCategory,
  EVENT_CONFIRMATION_LABELS,
  EventConfirmationStatus,
  ExportRecord,
  Fact,
  GovernancePolicySettings,
  INSTITUTION_CATEGORY_LABELS,
  InstitutionCategory,
  LegalInstrument,
  LegalReviewConclusion,
  LONG_TERM_STRUCTURE_LABELS,
  Project,
  ProjectEvent,
  PROJECT_EVENT_TYPE_LABELS,
  ProjectEventType,
  ProvisionVersion,
  RESEARCH_CATEGORIES,
  RESEARCH_CATEGORY_LABELS,
  ReviewDecision,
  SourceRecord,
  USER_ROLE_LABELS,
  UserRole,
  VAT_TREATMENT_LABELS,
  WorkspaceMode,
} from './types/legalDomain.ts';
import { SYNTHETIC_WARNING_LABEL } from './data/seedData.ts';
import {
  AddEventModal,
  NewProjectModal,
  UploadHistoricalSourceModal,
} from './components/SecondaryModalsAndDrawers.tsx';
import {
  AmendmentImpactWorkspace,
  DataConnectionAndGovernanceScreen,
  EvidenceViewerScreen,
  HistoricalComparisonView,
  LegalAiEvidenceAssistant,
} from './components/ComparisonAndEvidenceViews.tsx';
import {
  exportReviewMatrixToXlsx,
  exportReviewReportToDocx,
} from './utils/reportExporter.ts';

type ScreenId =
  | 'DASHBOARD'
  | 'WORKSPACE'
  | 'TIMELINE'
  | 'MATRIX'
  | 'COMPARISON'
  | 'EVIDENCE_VIEWER'
  | 'REVIEW_QUEUE'
  | 'CONNECTIONS'
  | 'AMENDMENT_IMPACT'
  | 'AI_QA'
  | 'REPORTING';

interface BootstrapPayload {
  currentUser: AppUser;
  allUsers: AppUser[];
  workspaceMode: WorkspaceMode;
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
  connectorStatuses: ConnectorStatusInfo[];
  governancePolicy: GovernancePolicySettings;
}

export default function App() {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(WorkspaceMode.PRODUCTION);
  const [activeActorId, setActiveActorId] = useState<string>('user-legal-01');
  const [activeScreen, setActiveScreen] = useState<ScreenId>('DASHBOARD');
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<{
    type: 'INFO' | 'ERROR';
    text: string;
  } | null>(null);

  // Modals
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [isAddEventOpen, setIsAddEventOpen] = useState(false);
  const [isUploadSourceOpen, setIsUploadSourceOpen] = useState(false);

  // Review Matrix filters & Stage A/B evaluation state
  const [matrixCategoryFilter, setMatrixCategoryFilter] = useState<string>('ALL');
  const [matrixStatusFilter, setMatrixStatusFilter] = useState<string>('ALL');
  const [matrixSearch, setMatrixSearch] = useState<string>('');
  const [evalEventId, setEvalEventId] = useState<string>('');
  const [evalProvisionId, setEvalProvisionId] = useState<string>('');

  // Document Ingestion form state
  const [uploadDocCategory, setUploadDocCategory] = useState<DocumentCategory>(
    DocumentCategory.DESIGN_CHANGE_DOC
  );
  const [uploadFilename, setUploadFilename] = useState('제2회_설계변경_실정보고_공문.txt');
  const [uploadHasPagination, setUploadHasPagination] = useState(false);
  const [uploadRawText, setUploadRawText] = useState(
    '제1조(목적) 본 문서는 2025년 08월 12일 설계변경 실정보고 승인에 관한 건이다. 제2조(계약금액) 계약금액: 금 69,800,000,000원.'
  );

  // Legal Review Queue form state
  const [reviewDecisionType, setReviewDecisionType] =
    useState<ReviewDecision['decisionType']>('APPROVE_CONCLUSION');
  const [reviewConclusion, setReviewConclusion] = useState<LegalReviewConclusion>(
    '조건부 적용(경과조치·종전규정)'
  );
  const [reviewReason, setReviewReason] = useState('');

  const apiFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const res = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'x-actor-user-id': activeActorId,
          ...(options.headers || {}),
        },
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.errorKo || `요청 처리 중 오류가 발생했습니다 (HTTP ${res.status})`);
      }
      return json;
    },
    [activeActorId]
  );

  const loadBootstrap = useCallback(async () => {
    try {
      const payload: BootstrapPayload = await apiFetch(
        `/api/bootstrap?workspaceMode=${workspaceMode}`
      );
      setData(payload);
      if (
        payload.projects.length > 0 &&
        (!selectedProjectId || !payload.projects.some((p) => p.id === selectedProjectId))
      ) {
        setSelectedProjectId(payload.projects[0].id);
      }
    } catch (err: unknown) {
      setBannerMessage({
        type: 'ERROR',
        text: err instanceof Error ? err.message : String(err),
      });
    }
  }, [apiFetch, workspaceMode, selectedProjectId]);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  const activeProject = useMemo(() => {
    if (!data) return null;
    return data.projects.find((p) => p.id === selectedProjectId) || data.projects[0] || null;
  }, [data, selectedProjectId]);

  const projectEvents = useMemo(() => {
    if (!data || !activeProject) return [];
    return data.events.filter((e) => e.projectId === activeProject.id);
  }, [data, activeProject]);

  const projectDocuments = useMemo(() => {
    if (!data || !activeProject) return [];
    return data.documents.filter((d) => d.projectId === activeProject.id);
  }, [data, activeProject]);

  const projectFacts = useMemo(() => {
    if (!data || !activeProject) return [];
    return data.facts.filter((f) => f.projectId === activeProject.id);
  }, [data, activeProject]);

  const projectAssessments = useMemo(() => {
    if (!data || !activeProject) return [];
    return data.assessments.filter((a) => a.projectId === activeProject.id);
  }, [data, activeProject]);

  const projectDecisions = useMemo(() => {
    if (!data || !activeProject) return [];
    return data.reviewDecisions.filter((rd) => rd.projectId === activeProject.id);
  }, [data, activeProject]);

  useEffect(() => {
    if (projectEvents.length > 0 && !evalEventId) {
      setEvalEventId(projectEvents[0].id);
    }
    if (data && data.provisionVersions.length > 0 && !evalProvisionId) {
      setEvalProvisionId(data.provisionVersions[0].id);
    }
  }, [projectEvents, data, evalEventId, evalProvisionId]);

  // Filtered Review Matrix rows
  const filteredAssessments = useMemo(() => {
    return projectAssessments.filter((a) => {
      if (matrixCategoryFilter !== 'ALL' && a.researchCategory !== matrixCategoryFilter) {
        return false;
      }
      if (matrixStatusFilter !== 'ALL' && a.status !== matrixStatusFilter) {
        return false;
      }
      if (matrixSearch.trim()) {
        const q = matrixSearch.trim().toLowerCase();
        const pv = data?.provisionVersions.find((p) => p.id === a.provisionVersionId);
        const hay = `${a.issueTitle} ${pv?.officialDocumentTitle || ''} ${
          pv?.articleNumber || ''
        } ${a.verbatimSourceExcerpt} ${a.modelOrRuleAnalysisText}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [projectAssessments, matrixCategoryFilter, matrixStatusFilter, matrixSearch, data]);

  // Integrated Timeline items (Project events + Promulgation + General Effective + Provision-specific Effective + Cutoff)
  const timelineEntries = useMemo(() => {
    if (!data || !activeProject) return [];
    const items: Array<{
      id: string;
      date: string;
      kind:
        | 'PROJECT_EVENT'
        | 'PROMULGATION_DATE'
        | 'GENERAL_EFFECTIVE_DATE'
        | 'PROVISION_SPECIFIC_EFFECTIVE_DATE'
        | 'RESEARCH_CUTOFF';
      kindLabel: string;
      title: string;
      subtitle: string;
      precisionLabel: string;
    }> = [];

    for (const ev of projectEvents) {
      if (ev.eventDate) {
        items.push({
          id: `tl-ev-${ev.id}`,
          date: ev.eventDate,
          kind: 'PROJECT_EVENT',
          kindLabel: '공사 이벤트(사실 발생일)',
          title: ev.eventTitle,
          subtitle: `출처: ${ev.pageOrSectionRef} · 확인상태: ${
            EVENT_CONFIRMATION_LABELS[ev.confirmationStatus]
          }`,
          precisionLabel: DATE_PRECISION_LABELS[ev.datePrecision],
        });
      }
    }

    for (const pv of data.provisionVersions) {
      if (pv.promulgationDate) {
        items.push({
          id: `tl-prom-${pv.id}`,
          date: pv.promulgationDate,
          kind: 'PROMULGATION_DATE',
          kindLabel: '법령 공포일',
          title: `[공포] ${pv.officialDocumentTitle} (${pv.amendmentNumber})`,
          subtitle: `대상 조문: ${pv.articleNumber} (${pv.articleTitle})`,
          precisionLabel: '공포일(시행일과 구별 필수)',
        });
      }
      if (pv.generalEffectiveDate) {
        items.push({
          id: `tl-gen-${pv.id}`,
          date: pv.generalEffectiveDate,
          kind: 'GENERAL_EFFECTIVE_DATE',
          kindLabel: '법령 일반 시행일',
          title: `[일반시행] ${pv.officialDocumentTitle} (${pv.amendmentNumber})`,
          subtitle: `부칙 제1조 본문 일반 시행일`,
          precisionLabel: '일반 시행일',
        });
      }
      if (
        pv.provisionEffectiveDate &&
        pv.provisionEffectiveDate !== pv.generalEffectiveDate
      ) {
        items.push({
          id: `tl-prov-${pv.id}`,
          date: pv.provisionEffectiveDate,
          kind: 'PROVISION_SPECIFIC_EFFECTIVE_DATE',
          kindLabel: '조문별 개별 시행일(부칙 단서)',
          title: `[개별조문 시행] ${pv.officialDocumentTitle} ${pv.articleNumber}`,
          subtitle: `일반 시행일(${pv.generalEffectiveDate})과 다른 조문별 특별 시행일 — ${pv.supplementaryProvisionsText}`,
          precisionLabel: '조문별 개별 시행일',
        });
      }
    }

    items.push({
      id: 'tl-cutoff',
      date: activeProject.researchCutoffDate,
      kind: 'RESEARCH_CUTOFF',
      kindLabel: '법령 조사 기준일(Cutoff)',
      title: '프로젝트 법령 시점검토 기준일 (Research Cutoff Date)',
      subtitle: '이 일자까지 공포·시행된 법령 및 부칙을 기준으로 검토 수행',
      precisionLabel: '기준 컷오프',
    });

    return items.sort((a, b) => a.date.localeCompare(b.date));
  }, [data, activeProject, projectEvents]);

  // Handlers
  const handleCreateProject = async (payload: Partial<Project>) => {
    try {
      const res = await apiFetch('/api/projects', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await loadBootstrap();
      if (res.project?.id) {
        setSelectedProjectId(res.project.id);
        setActiveScreen('WORKSPACE');
      }
      setBannerMessage({
        type: 'INFO',
        text: `신규 프로젝트 [${res.project.projectCode}]가 생성되었습니다.`,
      });
    } catch (err: unknown) {
      setBannerMessage({
        type: 'ERROR',
        text: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleUpdateProjectRegime = async (
    status: ContractingRegimeStatus,
    value: ContractingRegimeValue,
    note: string
  ) => {
    if (!activeProject) return;
    try {
      await apiFetch(`/api/projects/${activeProject.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          contractingRegimeStatus: status,
          contractingRegimeValue: value,
          contractingRegimeVerificationNote: note,
        }),
      });
      await loadBootstrap();
      setBannerMessage({
        type: 'INFO',
        text: '발주처 계약 법제 체계 상태가 업데이트되었으며, 관련 검토 항목에 재검토 플래그가 반영되었습니다.',
      });
    } catch (err: unknown) {
      setBannerMessage({
        type: 'ERROR',
        text: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleAddEvent = async (payload: Record<string, unknown>) => {
    if (!activeProject) return;
    try {
      await apiFetch(`/api/projects/${activeProject.id}/events`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await loadBootstrap();
      setBannerMessage({
        type: 'INFO',
        text: '신규 공사 이벤트가 등록되었습니다.',
      });
    } catch (err: unknown) {
      setBannerMessage({
        type: 'ERROR',
        text: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleConfirmOrUpdateEvent = async (
    eventId: string,
    updates: Partial<ProjectEvent>
  ) => {
    if (!activeProject) return;
    try {
      await apiFetch(`/api/projects/${activeProject.id}/events/${eventId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      await loadBootstrap();
      setBannerMessage({
        type: 'INFO',
        text: '공사 이벤트 사실 확인 상태가 업데이트되었습니다.',
      });
    } catch (err: unknown) {
      setBannerMessage({
        type: 'ERROR',
        text: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleIngestDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject) return;
    try {
      const res = await apiFetch(`/api/projects/${activeProject.id}/documents`, {
        method: 'POST',
        body: JSON.stringify({
          documentCategory: uploadDocCategory,
          originalFilename: uploadFilename,
          mimeType: uploadFilename.endsWith('.tiff') ? 'image/tiff' : 'text/plain',
          fileSizeBytes: uploadRawText.length || 1024,
          rawContentText: uploadRawText,
          hasStablePagination: uploadHasPagination,
          pageCount: uploadHasPagination ? 5 : null,
        }),
      });
      await loadBootstrap();
      setBannerMessage({
        type: 'INFO',
        text: res.document.isUnreadableScan
          ? `스캔 품질 불량 감지: [${res.document.originalFilename}]에서 텍스트 레이어를 읽을 수 없어 OCR/수동 입력 대상으로 분류되었습니다.`
          : `문서 [${res.document.originalFilename}] 업로드 완료 — 후보 사실 ${res.candidateFacts.length}건이 추출되어 담당자 확인 대기열에 등록되었습니다.`,
      });
    } catch (err: unknown) {
      setBannerMessage({
        type: 'ERROR',
        text: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleFileInputRead = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFilename(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setUploadRawText(reader.result);
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmOrRejectFact = async (
    factId: string,
    status: 'CONFIRMED' | 'REJECTED',
    newValue?: string
  ) => {
    if (!activeProject) return;
    try {
      await apiFetch(`/api/projects/${activeProject.id}/facts/${factId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          ...(newValue !== undefined ? { value: newValue } : {}),
        }),
      });
      await loadBootstrap();
      setBannerMessage({
        type: 'INFO',
        text:
          status === 'CONFIRMED'
            ? '추출 사실이 프로젝트 공식 확인 데이터(CONFIRMED)로 승인되었습니다.'
            : '추출 후보 사실이 반려되었습니다.',
      });
    } catch (err: unknown) {
      setBannerMessage({
        type: 'ERROR',
        text: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleRunTwoStageEvaluation = async () => {
    if (!activeProject || !evalEventId || !evalProvisionId) return;
    try {
      const res = await apiFetch(`/api/projects/${activeProject.id}/evaluate`, {
        method: 'POST',
        body: JSON.stringify({
          eventId: evalEventId,
          provisionVersionId: evalProvisionId,
        }),
      });
      await loadBootstrap();
      setSelectedAssessmentId(res.assessment.id);
      setBannerMessage({
        type: 'INFO',
        text: `2단계 시점별 적용성 검토 완료: [${res.assessment.issueTitle}] → 판정: ${res.assessment.status}`,
      });
    } catch (err: unknown) {
      setBannerMessage({
        type: 'ERROR',
        text: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleSubmitLegalReview = async (assessmentId: string) => {
    try {
      await apiFetch(`/api/assessments/${assessmentId}/review`, {
        method: 'POST',
        body: JSON.stringify({
          decisionType: reviewDecisionType,
          recordedConclusion:
            reviewDecisionType === 'APPROVE_CONCLUSION' ? reviewConclusion : null,
          reasonText: reviewReason,
        }),
      });
      setReviewReason('');
      await loadBootstrap();
      setBannerMessage({
        type: 'INFO',
        text: '법무 검토자의 공식 검토 결정 및 결론이 기록되었습니다.',
      });
    } catch (err: unknown) {
      setBannerMessage({
        type: 'ERROR',
        text: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleUploadHistoricalSource = async (payload: Record<string, unknown>) => {
    try {
      await apiFetch('/api/sources/manual', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await loadBootstrap();
      setBannerMessage({
        type: 'INFO',
        text: '공식 연혁 조문 및 부칙 원문이 등록되었습니다. 선행 버전이 연결된 경우 개정 영향 워크스페이스에 반영되었습니다.',
      });
    } catch (err: unknown) {
      setBannerMessage({
        type: 'ERROR',
        text: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleExportAction = async (
    format: 'XLSX_MATRIX' | 'DOCX_REPORT' | 'PRINT_PDF_VIEW'
  ) => {
    if (!data || !activeProject) return;
    try {
      await apiFetch(`/api/projects/${activeProject.id}/exports`, {
        method: 'POST',
        body: JSON.stringify({
          exportFormat: format,
          selectedEventIds: projectEvents.map((e) => e.id),
        }),
      });

      const exportInput = {
        project: activeProject,
        events: projectEvents,
        assessments: projectAssessments,
        provisions: data.provisionVersions,
        sources: data.sourceRecords,
        decisions: projectDecisions,
        generatedBy: `${data.currentUser.name} (${data.currentUser.department})`,
      };

      if (format === 'XLSX_MATRIX') {
        exportReviewMatrixToXlsx(exportInput);
      } else if (format === 'DOCX_REPORT') {
        await exportReviewReportToDocx(exportInput);
      } else {
        window.print();
      }
      await loadBootstrap();
    } catch (err: unknown) {
      setBannerMessage({
        type: 'ERROR',
        text: err instanceof Error ? err.message : String(err),
      });
    }
  };

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm font-medium text-slate-700">
          공공공사 법령 시점검토 시스템을 불러오는 중입니다...
        </div>
      </div>
    );
  }

  // Dashboard summary metrics
  const unresolvedRegimeProjects = data.projects.filter(
    (p) =>
      p.contractingRegimeStatus !== ContractingRegimeStatus.VERIFIED ||
      p.contractingRegimeValue === ContractingRegimeValue.UNRESOLVED
  );
  const missingSourceAssessments = data.assessments.filter((a) => a.status === '원문 확보 필요');
  const transitionalReviewAssessments = data.assessments.filter(
    (a) =>
      a.status === '부칙·경과조치 검토 필요' ||
      a.supplementaryAndTransitionalAnalysis.includes('경과조치')
  );
  const amendmentAffectedAssessments = data.assessments.filter((a) => a.affectedByLaterAmendment);
  const awaitingLegalReviewAssessments = data.assessments.filter(
    (a) => a.status !== '법무 검토 완료'
  );

  const allProjectAssessmentsReviewed =
    projectAssessments.length > 0 &&
    projectAssessments.every((a) => a.status === '법무 검토 완료');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* STRICT 3-ZONE TOP BAR CONTRACT */}
      <header className="no-print flex items-center justify-between gap-8 px-6 py-3.5 bg-white border-b border-slate-200">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#dashboard"
          onClick={(e) => {
            e.preventDefault();
            setActiveScreen('DASHBOARD');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          공공공사 법령 시점검토
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <a
            href="#dashboard"
            onClick={(e) => {
              e.preventDefault();
              setActiveScreen('DASHBOARD');
            }}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
              activeScreen === 'DASHBOARD' ? 'text-slate-900 underline underline-offset-4' : ''
            }`}
          >
            종합 대시보드
          </a>
          <a
            href="#workspace"
            onClick={(e) => {
              e.preventDefault();
              setActiveScreen('WORKSPACE');
            }}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
              activeScreen === 'WORKSPACE' ? 'text-slate-900 underline underline-offset-4' : ''
            }`}
          >
            프로젝트·사실확정
          </a>
          <a
            href="#matrix"
            onClick={(e) => {
              e.preventDefault();
              setActiveScreen('MATRIX');
            }}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
              activeScreen === 'MATRIX' ? 'text-slate-900 underline underline-offset-4' : ''
            }`}
          >
            시점검토 매트릭스
          </a>
          <a
            href="#review-queue"
            onClick={(e) => {
              e.preventDefault();
              setActiveScreen('REVIEW_QUEUE');
            }}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
              activeScreen === 'REVIEW_QUEUE' ? 'text-slate-900 underline underline-offset-4' : ''
            }`}
          >
            법무 검토 대기열
          </a>
          <a
            href="#reporting"
            onClick={(e) => {
              e.preventDefault();
              setActiveScreen('REPORTING');
            }}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
              activeScreen === 'REPORTING' ? 'text-slate-900 underline underline-offset-4' : ''
            }`}
          >
            보고서·내보내기
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setIsNewProjectOpen(true)}
            className="px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            신규 프로젝트 등록
          </button>
        </div>
      </header>

      {/* WORKSPACE CONTEXT & RBAC TOOLBAR (Below Header) */}
      <div className="no-print bg-slate-100 border-b border-slate-200 px-6 py-2.5">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4 text-xs">
          {/* Workspace Isolation Switch */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-slate-700 whitespace-nowrap">데이터 격리 영역:</span>
            <div className="flex items-center gap-1 p-1 bg-slate-200/80 rounded-lg">
              <button
                type="button"
                onClick={() => setWorkspaceMode(WorkspaceMode.PRODUCTION)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  workspaceMode === WorkspaceMode.PRODUCTION
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                실제 프로젝트 (PRODUCTION)
              </button>
              <button
                type="button"
                onClick={() => setWorkspaceMode(WorkspaceMode.DEMO)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  workspaceMode === WorkspaceMode.DEMO
                    ? 'bg-amber-500 text-slate-950 font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                데모 워크스페이스 (가상 예시)
              </button>
            </div>

            {workspaceMode === WorkspaceMode.DEMO && (
              <button
                type="button"
                onClick={async () => {
                  await apiFetch('/api/demo/reset', { method: 'POST' });
                  await loadBootstrap();
                  setBannerMessage({
                    type: 'INFO',
                    text: '데모 워크스페이스가 초기 가상 픽스처 상태로 복원되었습니다.',
                  });
                }}
                className="px-2.5 py-1 text-xs text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                데모 데이터 초기화
              </button>
            )}
          </div>

          {/* Active Project Selector & RBAC User Role Switcher */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700 whitespace-nowrap">대상 프로젝트:</span>
              <select
                value={activeProject?.id || ''}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="px-2.5 py-1 text-xs border border-slate-300 rounded bg-white max-w-[320px] truncate"
              >
                {data.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.projectCode}] {p.projectName}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700 whitespace-nowrap">현재 접속 권한(RBAC):</span>
              <select
                value={activeActorId}
                onChange={(e) => setActiveActorId(e.target.value)}
                className="px-2.5 py-1 text-xs border border-slate-300 rounded bg-white"
              >
                {data.allUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {USER_ROLE_LABELS[u.role]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* DEMO SYNTHETIC WARNING BANNER */}
      {workspaceMode === WorkspaceMode.DEMO && (
        <div className="no-print bg-amber-100 border-b border-amber-300 px-6 py-2 text-xs text-amber-950 font-semibold text-center">
          ▲ [{SYNTHETIC_WARNING_LABEL}] 현재 데모 워크스페이스에 접속 중입니다. 표시되는 모든 프로젝트·법령 조문·부칙·결론은 기능 검증용 가상 데이터이며 실제 프로젝트와 철저히 분리됩니다.
        </div>
      )}

      {/* FEEDBACK / ERROR BANNER */}
      {bannerMessage && (
        <div
          className={`no-print px-6 py-2.5 text-xs flex items-center justify-between border-b ${
            bannerMessage.type === 'ERROR'
              ? 'bg-rose-50 border-rose-200 text-rose-900 font-medium'
              : 'bg-slate-900 text-white border-slate-800'
          }`}
        >
          <span>{bannerMessage.text}</span>
          <button
            type="button"
            onClick={() => setBannerMessage(null)}
            className="px-2 py-0.5 text-xs underline ml-4 whitespace-nowrap shrink-0"
          >
            닫기
          </button>
        </div>
      )}

      {/* MAIN BODY WITH SIDEBAR NAVIGATION FOR ALL 11 SCREENS */}
      <div className="flex-1 max-w-[1440px] w-full mx-auto flex flex-col lg:flex-row">
        {/* Left Sidebar Navigation (250px) */}
        <aside className="no-print w-full lg:w-64 shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 p-4 space-y-5">
          <div>
            <div className="text-[11px] font-semibold text-slate-400 px-2.5 mb-1.5">
              핵심 워크플로우 화면 (A~I)
            </div>
            <div className="space-y-0.5 text-xs">
              {(
                [
                  ['DASHBOARD', 'A. 종합 대시보드'],
                  ['WORKSPACE', 'B. 프로젝트·문서·사실확정'],
                  ['TIMELINE', 'C. 법령·공사 통합 타임라인'],
                  ['MATRIX', 'D. 시점별 검토 매트릭스'],
                  ['COMPARISON', 'E. 신·구 조문 및 부칙 대비'],
                  ['EVIDENCE_VIEWER', 'F. 원문·판단근거 뷰어'],
                  ['REVIEW_QUEUE', 'G. 법무 검토 대기열'],
                  ['CONNECTIONS', 'H. 데이터 연결·거버넌스'],
                  ['AMENDMENT_IMPACT', 'I. 개정 영향 워크스페이스'],
                ] as Array<[ScreenId, string]>
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveScreen(id)}
                  className={`w-full text-left px-2.5 py-2 rounded-md font-medium transition-colors whitespace-nowrap truncate ${
                    activeScreen === id
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200">
            <div className="text-[11px] font-semibold text-slate-400 px-2.5 mb-1.5">
              보조 질의 및 보고서 출력
            </div>
            <div className="space-y-0.5 text-xs">
              <button
                type="button"
                onClick={() => setActiveScreen('AI_QA')}
                className={`w-full text-left px-2.5 py-2 rounded-md font-medium transition-colors whitespace-nowrap truncate ${
                  activeScreen === 'AI_QA'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                증거 기반 한국어 질의응답
              </button>
              <button
                type="button"
                onClick={() => setActiveScreen('REPORTING')}
                className={`w-full text-left px-2.5 py-2 rounded-md font-medium transition-colors whitespace-nowrap truncate ${
                  activeScreen === 'REPORTING'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                보고서·XLSX·DOCX 내보내기
              </button>
            </div>
          </div>

          {/* Quick Principles Box */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded text-[11px] text-slate-600 space-y-1.5">
            <div className="font-semibold text-slate-800">법령 시점검토 핵심 원칙</div>
            <div>· 특정 일자 '시행 중 법령'과 당해 공사 이벤트 '적용 법령' 엄격 구별</div>
            <div>· 공포일·일반시행일·조문별 시행일·부칙 경과조치 개별 확인</div>
            <div>· 조달청 대행 여부만으로 국가계약법 단정 금지 (발주처 기준)</div>
            <div>· 원문 미확보 시 현행 법령 대체 금지</div>
          </div>
        </aside>

        {/* Main Content Viewport */}
        <main className="flex-1 p-6 overflow-x-hidden">
          {/* ================= SCREEN A: DASHBOARD ================= */}
          {activeScreen === 'DASHBOARD' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                  <h1 className="text-lg font-semibold text-slate-900">
                    A. 공공공사 법령 시점검토 종합 대시보드
                  </h1>
                  <p className="text-xs text-slate-600 mt-0.5">
                    법무 검토 대기 현황, 미해결 계약 법제 체계(LH·공공기관 등), 미확보 연혁 원문, 부칙·경과조치 쟁점 및 후속 개정 영향 항목을 한눈에 점검합니다.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsUploadSourceOpen(true)}
                    className="px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    공식 연혁 법령 원문 수동 등록
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveScreen('MATRIX')}
                    className="px-3.5 py-2 text-xs font-medium text-white bg-slate-900 rounded hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    시점별 검토 매트릭스 열기 →
                  </button>
                </div>
              </div>

              {/* 5 Mandatory Summary Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {[
                  {
                    label: '법무 검토 대기 항목',
                    count: awaitingLegalReviewAssessments.length,
                    sub: `전체 평가 ${data.assessments.length}건 중 미승인`,
                    action: () => setActiveScreen('REVIEW_QUEUE'),
                  },
                  {
                    label: '미해결 계약 법제 체계',
                    count: unresolvedRegimeProjects.length,
                    sub: 'LH·공공기관 편입 규정 확인 필요',
                    action: () => setActiveScreen('WORKSPACE'),
                  },
                  {
                    label: '과거 시점 원문·별표 미확보',
                    count: missingSourceAssessments.length,
                    sub: '현행 법령 임의 대체 차단됨',
                    action: () => setActiveScreen('EVIDENCE_VIEWER'),
                  },
                  {
                    label: '부칙·경과조치 중점 검토',
                    count: transitionalReviewAssessments.length,
                    sub: '종전 규정 보존 여부 확인 대상',
                    action: () => setActiveScreen('COMPARISON'),
                  },
                  {
                    label: '후속 개정 영향 감지 (승인 건)',
                    count: amendmentAffectedAssessments.length,
                    sub: '기승인 결론 덮어쓰기 방지됨',
                    action: () => setActiveScreen('AMENDMENT_IMPACT'),
                  },
                ].map((stat) => (
                  <button
                    key={stat.label}
                    type="button"
                    onClick={stat.action}
                    className="text-left bg-white border border-slate-200 rounded-lg p-4 hover:border-slate-400 transition-colors"
                  >
                    <div className="text-xs font-medium text-slate-600">{stat.label}</div>
                    <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                      {stat.count}건
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">{stat.sub}</div>
                  </button>
                ))}
              </div>

              {/* Project Register Table */}
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-slate-900">
                    등록된 공공공사 프로젝트 대장 ({data.projects.length}건)
                  </h2>
                  <span className="text-[11px] text-slate-500">
                    행 클릭 시 해당 프로젝트 워크스페이스로 전환됩니다
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <th className="py-2.5 px-3 font-medium">프로젝트 코드 / 공사명</th>
                        <th className="py-2.5 px-3 font-medium">발주처(계약주체) · 조달대행</th>
                        <th className="py-2.5 px-3 font-medium">계약 구조 · 총계약금액</th>
                        <th className="py-2.5 px-3 font-medium">적용 계약 법제 체계 상태</th>
                        <th className="py-2.5 px-3 font-medium">연구 기준일</th>
                        <th className="py-2.5 px-3 font-medium">담당자 (현장·공무·법무)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {data.projects.map((proj) => {
                        const isSelected = proj.id === activeProject?.id;
                        return (
                          <tr
                            key={proj.id}
                            onClick={() => {
                              setSelectedProjectId(proj.id);
                              setActiveScreen('WORKSPACE');
                            }}
                            className={`cursor-pointer hover:bg-slate-50 ${
                              isSelected ? 'bg-slate-50/90' : ''
                            }`}
                          >
                            <td className="py-3 px-3">
                              <div className="font-mono text-[11px] text-slate-500">
                                {proj.projectCode}
                              </div>
                              <div className="font-semibold text-slate-900 mt-0.5">
                                {proj.projectName}
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <div className="font-medium text-slate-900">
                                발주처: {proj.contractingPrincipal}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                조달대행: {proj.procurementAgency}
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <div className="text-slate-800">{proj.contractStructure}</div>
                              <div className="font-mono tabular-nums text-[11px] text-slate-600">
                                {proj.totalContractAmountKrw
                                  ? `${proj.totalContractAmountKrw.toLocaleString('ko-KR')}원`
                                  : '계약금액 미상'}
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <div
                                className={
                                  proj.contractingRegimeStatus === ContractingRegimeStatus.VERIFIED
                                    ? 'text-emerald-800 font-semibold'
                                    : 'text-amber-800 font-semibold'
                                }
                              >
                                {proj.contractingRegimeStatus === ContractingRegimeStatus.VERIFIED
                                  ? '■ '
                                  : '▲ '}
                                {CONTRACTING_REGIME_STATUS_LABELS[proj.contractingRegimeStatus]}
                              </div>
                              <div className="text-[11px] text-slate-600 mt-0.5">
                                {CONTRACTING_REGIME_VALUE_LABELS[proj.contractingRegimeValue]}
                              </div>
                            </td>
                            <td className="py-3 px-3 font-mono tabular-nums text-slate-700">
                              {proj.researchCutoffDate}
                            </td>
                            <td className="py-3 px-3 text-[11px] text-slate-600">
                              현장: {proj.siteManager} · 공무: {proj.contractManager} · 법무:{' '}
                              {proj.legalReviewer}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= SCREEN B: PROJECT WORKSPACE & DOCUMENT/FACT INTAKE ================= */}
          {activeScreen === 'WORKSPACE' && activeProject && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                  <h1 className="text-lg font-semibold text-slate-900">
                    B. 프로젝트 워크스페이스 — [{activeProject.projectCode}] {activeProject.projectName}
                  </h1>
                  <p className="text-xs text-slate-600 mt-0.5">
                    발주처 법제 체계 검증, 공사 단계별 개별 이벤트 일자·근거문서 관리, 문서 업로드(SHA-256·OCR 한계 기록) 및 추출 후보 사실 확정(Confirm)을 수행합니다.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddEventOpen(true)}
                    className="px-3.5 py-2 text-xs font-medium text-white bg-slate-900 rounded hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    + 공사 이벤트(기준일) 추가
                  </button>
                </div>
              </div>

              {/* 1. Explicit Contracting Regime Verification Card */}
              <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4 pb-3 border-b border-slate-200">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      1. 발주처·조달대행 구분 및 적용 계약 법제 체계 검증 (Regime Verification)
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      기관명이나 조달청(나라장터) 입찰 대행 여부만으로 국가계약법 적용을 단정하지 않으며, 발주기관의 설립 근거·계약사무규칙·편입 계약조건을 검증합니다.
                    </p>
                  </div>
                  <div className="text-xs font-semibold">
                    {activeProject.contractingRegimeStatus === ContractingRegimeStatus.VERIFIED ? (
                      <span className="text-emerald-800">
                        ■ {CONTRACTING_REGIME_STATUS_LABELS[activeProject.contractingRegimeStatus]}
                      </span>
                    ) : (
                      <span className="text-amber-800">
                        ▲ {CONTRACTING_REGIME_STATUS_LABELS[activeProject.contractingRegimeStatus]}
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                  <div>
                    <div className="text-slate-500">발주처 (계약주체)</div>
                    <div className="font-semibold text-slate-900 mt-0.5">
                      {activeProject.contractingPrincipal}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {INSTITUTION_CATEGORY_LABELS[activeProject.institutionCategory]}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">조달 대행기관</div>
                    <div className="font-semibold text-slate-900 mt-0.5">
                      {activeProject.procurementAgency}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      계약담당: {activeProject.contractAdministrator || '-'} / 감독:{' '}
                      {activeProject.supervisingAuthority || '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">공사 종류·계약 구조·역할</div>
                    <div className="font-semibold text-slate-900 mt-0.5">
                      {activeProject.constructionType}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {LONG_TERM_STRUCTURE_LABELS[activeProject.longTermStructureType]} ·{' '}
                      {CONTRACTOR_ROLE_LABELS[activeProject.contractorRole]}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">총 도급계약금액 및 부가세</div>
                    <div className="font-mono font-semibold tabular-nums text-slate-900 mt-0.5">
                      {activeProject.totalContractAmountKrw
                        ? `${activeProject.totalContractAmountKrw.toLocaleString('ko-KR')}원`
                        : '미확정'}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {VAT_TREATMENT_LABELS[activeProject.vatTreatment]} · 소재지:{' '}
                      {activeProject.projectLocation}
                    </div>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded text-xs space-y-2">
                  <div>
                    <span className="font-semibold text-slate-800">현재 적용 법제 분류: </span>
                    <span className="text-slate-900">
                      {CONTRACTING_REGIME_VALUE_LABELS[activeProject.contractingRegimeValue]}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-800">법제 검증 메모: </span>
                    <span className="text-slate-700">
                      {activeProject.contractingRegimeVerificationNote}
                    </span>
                  </div>
                  <div className="pt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateProjectRegime(
                          ContractingRegimeStatus.VERIFIED,
                          activeProject.institutionCategory === InstitutionCategory.LOCAL_GOVERNMENT
                            ? ContractingRegimeValue.LOCAL_CONTRACT_ACT
                            : activeProject.institutionCategory ===
                              InstitutionCategory.PUBLIC_ENTERPRISE_LH
                            ? ContractingRegimeValue.PUBLIC_INSTITUTION_RULES_AND_NATIONAL
                            : ContractingRegimeValue.NATIONAL_CONTRACT_ACT,
                          '도급계약서 제2조·제3조 및 편입 공사계약일반조건 원문 대조를 통해 발주처 계약 법제 체계 검증 완료'
                        )
                      }
                      className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded"
                    >
                      근거문서 대조 후 법제 체계 [확인 완료]로 전환
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateProjectRegime(
                          ContractingRegimeStatus.UNRESOLVED,
                          ContractingRegimeValue.UNRESOLVED,
                          '편입 계약조건 개정 차수 재확인이 필요하여 법제 체계를 [미해결] 상태로 보류함'
                        )
                      }
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded"
                    >
                      법제 체계 [미해결] 보류로 전환
                    </button>
                  </div>
                </div>
              </div>

              {/* 2. Separate Project Events & Dates Table */}
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <h2 className="text-xs font-semibold text-slate-900">
                      2. 공사 단계별 개별 이벤트 및 기준일 대장 ({projectEvents.length}건 — 단일 '프로젝트 일자' 통합 금지)
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      입찰공고, 최초계약, 연차계약, 실착공, 설계변경, 물가변동, 일시정지, 준공, 하자 등 이벤트별 일자 정밀도와 출처 앵커를 개별 보존합니다.
                    </p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <th className="py-2.5 px-3 font-medium">이벤트 구분</th>
                        <th className="py-2.5 px-3 font-medium">이벤트 상세명</th>
                        <th className="py-2.5 px-3 font-medium">발생 일자 (YYYY-MM-DD)</th>
                        <th className="py-2.5 px-3 font-medium">일자 정밀도</th>
                        <th className="py-2.5 px-3 font-medium">출처 문서 및 페이지/절 앵커</th>
                        <th className="py-2.5 px-3 font-medium">확인 상태</th>
                        <th className="py-2.5 px-3 font-medium">조치</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {projectEvents.map((ev) => (
                        <tr key={ev.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 text-slate-700">
                            {PROJECT_EVENT_TYPE_LABELS[ev.eventType]}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-900">
                            {ev.eventTitle}
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums">
                            {ev.eventDate ? (
                              <span className="text-slate-900 font-semibold">{ev.eventDate}</span>
                            ) : (
                              <span className="text-rose-800 font-semibold">
                                일자 미상 (UNKNOWN)
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">
                            {DATE_PRECISION_LABELS[ev.datePrecision]}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">{ev.pageOrSectionRef}</td>
                          <td className="py-2.5 px-3">
                            <span
                              className={
                                ev.confirmationStatus === EventConfirmationStatus.CONFIRMED
                                  ? 'text-emerald-800 font-semibold'
                                  : 'text-amber-800 font-semibold'
                              }
                            >
                              {EVENT_CONFIRMATION_LABELS[ev.confirmationStatus]}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            {ev.confirmationStatus !== EventConfirmationStatus.CONFIRMED &&
                              ev.eventDate && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleConfirmOrUpdateEvent(ev.id, {
                                      confirmationStatus: EventConfirmationStatus.CONFIRMED,
                                    })
                                  }
                                  className="px-2.5 py-1 text-[11px] font-medium text-white bg-slate-900 rounded hover:bg-slate-800"
                                >
                                  사실 확정
                                </button>
                              )}
                            {!ev.eventDate && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleConfirmOrUpdateEvent(ev.id, {
                                    eventDate: '2025-07-25',
                                    datePrecision: DatePrecision.EXACT_DAY,
                                    pageOrSectionRef: '접수공문 제2025-812호 (p.1 확인)',
                                    confirmationStatus: EventConfirmationStatus.CONFIRMED,
                                  })
                                }
                                className="px-2.5 py-1 text-[11px] font-medium text-slate-800 bg-slate-100 border border-slate-300 rounded hover:bg-slate-200"
                              >
                                공문 일자 입력·확정
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 3. Document Ingestion & Candidate Fact Review */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Document Upload & Repository */}
                <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                  <h2 className="text-sm font-semibold text-slate-900">
                    3. 프로젝트 근거 문서 업로드 및 무결성 보존 (Document Ingestion)
                  </h2>
                  <p className="text-xs text-slate-500">
                    업로드된 파일은 SHA-256 해시와 함께 보존되며, 신뢰할 수 없는 증거(Untrusted Evidence)로 격리 처리됩니다. 고정 페이지 번호가 없는 문서는 절·항 앵커로만 위치가 기록됩니다.
                  </p>

                  <form onSubmit={handleIngestDocument} className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-medium text-slate-700 mb-1">문서 분류</label>
                        <select
                          value={uploadDocCategory}
                          onChange={(e) =>
                            setUploadDocCategory(e.target.value as DocumentCategory)
                          }
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                        >
                          {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block font-medium text-slate-700 mb-1">
                          로컬 파일 선택 (PDF/DOCX/TXT/이미지)
                        </label>
                        <input
                          type="file"
                          accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.tiff"
                          onChange={handleFileInputRead}
                          className="w-full text-xs text-slate-600"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 items-center">
                      <div>
                        <label className="block font-medium text-slate-700 mb-1">원본 파일명</label>
                        <input
                          type="text"
                          value={uploadFilename}
                          onChange={(e) => setUploadFilename(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                        />
                      </div>
                      <label className="flex items-center gap-2 pt-4 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={uploadHasPagination}
                          onChange={(e) => setUploadHasPagination(e.target.checked)}
                        />
                        <span>고정 페이지 번호(Pagination) 존재 문서</span>
                      </label>
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700 mb-1">
                        문서 추출 텍스트 (비워둘 경우 판독불가 스캔본으로 자동 감지 및 OCR/수동입력 분류)
                      </label>
                      <textarea
                        rows={3}
                        value={uploadRawText}
                        onChange={(e) => setUploadRawText(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        className="px-3.5 py-2 text-xs font-medium text-white bg-slate-900 rounded hover:bg-slate-800"
                      >
                        문서 등록 및 후보 사실·일자 추출
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setUploadFilename('판독불가_현장스캔본.tiff');
                          setUploadRawText('');
                        }}
                        className="px-3 py-2 text-xs text-slate-700 bg-slate-100 border border-slate-300 rounded hover:bg-slate-200"
                      >
                        판독불가 저해상도 스캔 테스트값 불러오기
                      </button>
                    </div>
                  </form>

                  <div className="pt-3 border-t border-slate-200 space-y-2">
                    <div className="text-xs font-semibold text-slate-800">
                      등록된 문서 목록 ({projectDocuments.length}건)
                    </div>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {projectDocuments.map((doc) => (
                        <div
                          key={doc.id}
                          className={`p-3 border rounded text-xs space-y-1 ${
                            doc.isUnreadableScan
                              ? 'bg-rose-50 border-rose-200'
                              : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between font-semibold text-slate-900">
                            <span>{doc.originalFilename}</span>
                            <span className="font-mono text-[11px] text-slate-500">
                              {doc.extractionMethod}
                            </span>
                          </div>
                          <div className="font-mono text-[11px] text-slate-500 truncate">
                            무결성 해시: {doc.fileHashSha256} · 등록자: {doc.uploaderName} (
                            {doc.uploadedAt})
                          </div>
                          <div className="text-[11px] text-slate-700">
                            페이지/OCR 안내: {doc.ocrLimitationNote}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Candidate Fact Review Screen */}
                <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                  <h2 className="text-sm font-semibold text-slate-900">
                    4. 추출 후보 사실 확인 및 확정 화면 (Fact Confirmation Queue)
                  </h2>
                  <p className="text-xs text-slate-500">
                    문서에서 추출된 후보 사실(CANDIDATE)은 담당자가 원문 발췌와 앵커를 대조하여 확정(Confirm)하기 전까지 공식 프로젝트 데이터로 사용되지 않습니다. 이미 확정된 사실을 수정하면 관련 법령 검토가 자동으로 '재검토 필요'로 전환됩니다.
                  </p>

                  <div className="space-y-2.5 max-h-[420px] overflow-y-auto">
                    {projectFacts.map((fact) => (
                      <div
                        key={fact.id}
                        className="p-3.5 bg-slate-50 border border-slate-200 rounded text-xs space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-900">{fact.label}</span>
                          <span
                            className={
                              fact.status === 'CONFIRMED'
                                ? 'text-emerald-800 font-semibold'
                                : fact.status === 'CANDIDATE'
                                ? 'text-amber-800 font-semibold'
                                : 'text-rose-800 font-semibold'
                            }
                          >
                            {fact.status === 'CONFIRMED'
                              ? '■ 확정됨 (CONFIRMED)'
                              : fact.status === 'CANDIDATE'
                              ? '▲ 담당자 확인 대기 (CANDIDATE)'
                              : '○ 반려됨'}
                          </span>
                        </div>
                        <div className="font-mono text-slate-900 font-medium">
                          추출값: {fact.value} · 위치 앵커: {fact.pageOrSectionAnchor}
                        </div>
                        <div className="text-[11px] text-slate-600">
                          원문 발췌: "{fact.verbatimExcerpt}"
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          {fact.status !== 'CONFIRMED' && (
                            <button
                              type="button"
                              onClick={() => handleConfirmOrRejectFact(fact.id, 'CONFIRMED')}
                              className="px-2.5 py-1 text-[11px] font-medium text-white bg-slate-900 rounded hover:bg-slate-800"
                            >
                              원문 대조 완료 및 사실 확정
                            </button>
                          )}
                          {fact.status === 'CANDIDATE' && (
                            <button
                              type="button"
                              onClick={() => handleConfirmOrRejectFact(fact.id, 'REJECTED')}
                              className="px-2.5 py-1 text-[11px] text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-100"
                            >
                              후보 반려
                            </button>
                          )}
                          {fact.status === 'CONFIRMED' && (
                            <button
                              type="button"
                              onClick={() =>
                                handleConfirmOrRejectFact(
                                  fact.id,
                                  'CONFIRMED',
                                  `${fact.value} (정정 확인)`
                                )
                              }
                              className="px-2.5 py-1 text-[11px] text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-100"
                            >
                              사실값 정정 기록 (종속 검토 재검토 전환 테스트)
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= SCREEN C: TIMELINE ================= */}
          {activeScreen === 'TIMELINE' && activeProject && (
            <div className="space-y-6">
              <div className="pb-4 border-b border-slate-200">
                <h1 className="text-lg font-semibold text-slate-900">
                  C. 공사 이벤트 및 법령 공포·시행·조문별 시행일 통합 타임라인
                </h1>
                <p className="text-xs text-slate-600 mt-0.5">
                  공사 사실 발생일(Project Event), 법령 공포일(Promulgation), 법령 일반 시행일(General Effective Date), 조문별 개별 시행일(Provision-Specific Commencement Date), 조사 기준일(Cutoff)을 시각적으로 엄격히 구분하여 시점 선후관계를 검증합니다.
                </p>
              </div>

              {/* Legend */}
              <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center gap-6 text-xs">
                <span className="font-semibold text-slate-900">일자 유형 범례:</span>
                <span className="text-slate-900 font-medium">
                  ■ 공사 이벤트 발생일 (사실 트리거)
                </span>
                <span className="text-slate-600">○ 법령 공포일 (시행일 아님)</span>
                <span className="text-emerald-800 font-medium">● 법령 일반 시행일 (부칙 본문)</span>
                <span className="text-amber-900 font-semibold">
                  ▲ 조문별 개별 시행일 (부칙 단서 — 단일 개정 내 상이 시행일)
                </span>
                <span className="text-rose-800 font-semibold">◆ 법령 조사 기준일 (Cutoff)</span>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="divide-y divide-slate-200 text-xs">
                  {timelineEntries.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-50"
                    >
                      <div className="flex items-start gap-4">
                        <div className="font-mono font-bold tabular-nums text-sm text-slate-900 w-28 shrink-0">
                          {item.date}
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold text-slate-600">
                            {item.kind === 'PROJECT_EVENT' && '■ '}
                            {item.kind === 'PROMULGATION_DATE' && '○ '}
                            {item.kind === 'GENERAL_EFFECTIVE_DATE' && '● '}
                            {item.kind === 'PROVISION_SPECIFIC_EFFECTIVE_DATE' && '▲ '}
                            {item.kind === 'RESEARCH_CUTOFF' && '◆ '}
                            {item.kindLabel} · {item.precisionLabel}
                          </div>
                          <div className="font-semibold text-slate-900 mt-0.5">{item.title}</div>
                          <div className="text-slate-600 mt-0.5">{item.subtitle}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ================= SCREEN D: REVIEW MATRIX (14 KOREAN COLUMNS) ================= */}
          {activeScreen === 'MATRIX' && activeProject && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                  <h1 className="text-lg font-semibold text-slate-900">
                    D. 시점별 법령·계약조건 적용 검토 매트릭스 (Review Matrix)
                  </h1>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Stage A(시점별 후보 조문 탐색) 및 Stage B(공사 이벤트·법제 체계·부칙 경과조치 결정론적 평가) 결과를 조문 단위로 표시합니다.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleExportAction('XLSX_MATRIX')}
                    className="px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    검토 매트릭스 XLSX 다운로드
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsUploadSourceOpen(true)}
                    className="px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    연혁 조문 수동 추가
                  </button>
                </div>
              </div>

              {/* Two-Stage Engine Runner Bar */}
              <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 text-xs">
                <div className="font-semibold text-slate-900">
                  2단계 시점별 적용성 엔진 실행 (Stage A 후보 탐색 + Stage B 이벤트별 요건·부칙 평가)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      1. 검토 대상 공사 이벤트 선택
                    </label>
                    <select
                      value={evalEventId}
                      onChange={(e) => setEvalEventId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
                    >
                      {projectEvents.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          [{ev.eventDate || '일자 미상'}] {ev.eventTitle} ({ev.confirmationStatus})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      2. 검토할 후보 법령·조문 버전 선택
                    </label>
                    <select
                      value={evalProvisionId}
                      onChange={(e) => setEvalProvisionId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
                    >
                      {data.provisionVersions.map((pv) => (
                        <option key={pv.id} value={pv.id}>
                          {pv.officialDocumentTitle} {pv.articleNumber} ({pv.amendmentNumber} · 시행:{' '}
                          {pv.provisionEffectiveDate || pv.generalEffectiveDate || '미상'})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={handleRunTwoStageEvaluation}
                      className="w-full px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded"
                    >
                      시점별 적용성 평가 생성 (근거 인용 포함)
                    </button>
                  </div>
                </div>
              </div>

              {/* Filter Bar */}
              <div className="flex flex-wrap items-center gap-3 bg-white p-3.5 border border-slate-200 rounded-lg text-xs">
                <input
                  type="text"
                  value={matrixSearch}
                  onChange={(e) => setMatrixSearch(e.target.value)}
                  placeholder="쟁점명, 법령명, 조문번호, 부칙 검색..."
                  className="px-3 py-1.5 border border-slate-300 rounded w-64"
                />
                <select
                  value={matrixCategoryFilter}
                  onChange={(e) => setMatrixCategoryFilter(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded bg-white"
                >
                  <option value="ALL">전체 검토 분야</option>
                  {RESEARCH_CATEGORIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <select
                  value={matrixStatusFilter}
                  onChange={(e) => setMatrixStatusFilter(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded bg-white"
                >
                  <option value="ALL">전체 검토 상태</option>
                  {(
                    [
                      '적용 후보',
                      '적용 근거 확인',
                      '비적용 근거 확인',
                      '추가 사실 확인 필요',
                      '부칙·경과조치 검토 필요',
                      '원문 확보 필요',
                      '법무 검토 완료',
                      '재검토 필요',
                    ] as ApplicabilityStatus[]
                  ).map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              {/* Exact 14-Column Korean Review Matrix */}
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs min-w-[1600px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                        <th className="py-2.5 px-2.5 font-semibold whitespace-nowrap">검토 분야</th>
                        <th className="py-2.5 px-2.5 font-semibold">쟁점</th>
                        <th className="py-2.5 px-2.5 font-semibold whitespace-nowrap">
                          관련 공사 이벤트
                        </th>
                        <th className="py-2.5 px-2.5 font-semibold whitespace-nowrap">기준일</th>
                        <th className="py-2.5 px-2.5 font-semibold">법령·문서명</th>
                        <th className="py-2.5 px-2.5 font-semibold whitespace-nowrap">조문</th>
                        <th className="py-2.5 px-2.5 font-semibold whitespace-nowrap">
                          버전·시행일
                        </th>
                        <th className="py-2.5 px-2.5 font-semibold whitespace-nowrap">
                          적용 판단
                        </th>
                        <th className="py-2.5 px-2.5 font-semibold">판단 근거</th>
                        <th className="py-2.5 px-2.5 font-semibold">부칙·경과조치</th>
                        <th className="py-2.5 px-2.5 font-semibold">미확인 사항</th>
                        <th className="py-2.5 px-2.5 font-semibold whitespace-nowrap">
                          원문 링크
                        </th>
                        <th className="py-2.5 px-2.5 font-semibold whitespace-nowrap">담당자</th>
                        <th className="py-2.5 px-2.5 font-semibold whitespace-nowrap">
                          검토 상태
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 align-top">
                      {filteredAssessments.map((a) => {
                        const ev = projectEvents.find((e) => e.id === a.eventId);
                        const pv = data.provisionVersions.find(
                          (p) => p.id === a.provisionVersionId
                        );
                        const src = pv
                          ? data.sourceRecords.find((s) => s.id === pv.sourceRecordId)
                          : undefined;

                        return (
                          <tr key={a.id} className="hover:bg-slate-50">
                            <td className="py-3 px-2.5 text-slate-700 whitespace-nowrap">
                              {RESEARCH_CATEGORY_LABELS[a.researchCategory]}
                            </td>
                            <td className="py-3 px-2.5 font-semibold text-slate-900 max-w-[200px]">
                              {a.syntheticLabel && (
                                <div className="text-[10px] text-amber-800 font-bold mb-0.5">
                                  [{a.syntheticLabel}]
                                </div>
                              )}
                              {a.issueTitle}
                            </td>
                            <td className="py-3 px-2.5 text-slate-800 whitespace-nowrap">
                              {ev?.eventTitle || '-'}
                            </td>
                            <td className="py-3 px-2.5 font-mono tabular-nums whitespace-nowrap">
                              {a.referenceDateUsed || (
                                <span className="text-rose-800 font-semibold">미상</span>
                              )}
                            </td>
                            <td className="py-3 px-2.5 text-slate-900 max-w-[180px]">
                              {pv?.officialDocumentTitle || '-'}
                            </td>
                            <td className="py-3 px-2.5 font-mono text-slate-800 whitespace-nowrap">
                              {pv?.articleNumber || '-'}
                            </td>
                            <td className="py-3 px-2.5 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                              <div>{pv?.amendmentNumber}</div>
                              <div>공포: {pv?.promulgationDate || '미상'}</div>
                              <div>일반시행: {pv?.generalEffectiveDate || '미상'}</div>
                              <div className="font-semibold text-slate-900">
                                조문시행:{' '}
                                {pv?.provisionEffectiveDate || pv?.generalEffectiveDate || '미상'}
                              </div>
                            </td>
                            <td className="py-3 px-2.5 whitespace-nowrap">
                              {a.legalReviewConclusion ? (
                                <span className="font-semibold text-emerald-800">
                                  {a.legalReviewConclusion}
                                </span>
                              ) : (
                                <span className="text-slate-700">{a.status}</span>
                              )}
                            </td>
                            <td className="py-3 px-2.5 text-slate-700 max-w-[240px]">
                              <div className="line-clamp-3">{a.modelOrRuleAnalysisText}</div>
                            </td>
                            <td className="py-3 px-2.5 text-slate-700 max-w-[200px]">
                              <div className="line-clamp-3">
                                {a.supplementaryAndTransitionalAnalysis}
                              </div>
                            </td>
                            <td className="py-3 px-2.5 max-w-[200px]">
                              {a.unresolvedIssues.length > 0 ? (
                                <span className="text-amber-900 font-medium">
                                  ▲ {a.unresolvedIssues.join(' / ')}
                                </span>
                              ) : (
                                <span className="text-slate-400">없음</span>
                              )}
                            </td>
                            <td className="py-3 px-2.5 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedAssessmentId(a.id);
                                  setActiveScreen('EVIDENCE_VIEWER');
                                }}
                                className="text-slate-900 underline font-medium hover:text-slate-600"
                              >
                                원문·근거 대조 ({src?.officialSourceId || '열기'})
                              </button>
                            </td>
                            <td className="py-3 px-2.5 text-slate-700 whitespace-nowrap">
                              {a.reviewedBy || a.assignedReviewer}
                            </td>
                            <td className="py-3 px-2.5 whitespace-nowrap font-semibold">
                              <span
                                className={
                                  a.status === '법무 검토 완료'
                                    ? 'text-emerald-800'
                                    : a.status === '원문 확보 필요' || a.status === '재검토 필요'
                                    ? 'text-rose-800'
                                    : 'text-amber-800'
                                }
                              >
                                {a.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= SCREEN E: HISTORICAL COMPARISON ================= */}
          {activeScreen === 'COMPARISON' && (
            <HistoricalComparisonView
              provisions={data.provisionVersions}
              workspaceMode={workspaceMode}
              onOpenUploadModal={() => setIsUploadSourceOpen(true)}
            />
          )}

          {/* ================= SCREEN F: EVIDENCE VIEWER ================= */}
          {activeScreen === 'EVIDENCE_VIEWER' && (
            <EvidenceViewerScreen
              assessments={projectAssessments}
              provisions={data.provisionVersions}
              sources={data.sourceRecords}
              documents={projectDocuments}
              events={projectEvents}
              selectedAssessmentId={selectedAssessmentId}
              onSelectAssessment={(id) => setSelectedAssessmentId(id)}
            />
          )}

          {/* ================= SCREEN G: LEGAL REVIEW QUEUE ================= */}
          {activeScreen === 'REVIEW_QUEUE' && activeProject && (
            <div className="space-y-6">
              <div className="pb-4 border-b border-slate-200">
                <h1 className="text-lg font-semibold text-slate-900">
                  G. 법무 검토 및 결재 대기열 (Legal Review Queue)
                </h1>
                <p className="text-xs text-slate-600 mt-0.5">
                  오직 인가된 법무 검토자(LEGAL_REVIEWER) 역할만 검토 상태를 '법무 검토 완료'로 승인할 수 있으며, 승인 시 실제 법무 결론(적용 / 비적용 / 조건부 적용 / 판단 보류)과 사유를 반드시 함께 기록해야 합니다.
                </p>
              </div>

              {data.currentUser.role !== UserRole.LEGAL_REVIEWER && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-950 font-medium">
                  ▲ 현재 접속 역할은 [{USER_ROLE_LABELS[data.currentUser.role]}]입니다. '법무 검토 완료' 승인 시 서버 RBAC 정책에 의해 차단(HTTP 403)됩니다. 상단 툴바에서 [김법무 수석변호사 — 법무 검토자]로 전환하여 승인하거나 권한 차단 동작을 직접 테스트할 수 있습니다.
                </div>
              )}

              <div className="space-y-4">
                {projectAssessments.map((a) => {
                  const pv = data.provisionVersions.find((p) => p.id === a.provisionVersionId);
                  return (
                    <div
                      key={a.id}
                      className="bg-white border border-slate-200 rounded-lg p-5 space-y-4 text-xs"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2 pb-3 border-b border-slate-200">
                        <div>
                          <div className="text-slate-500">
                            {RESEARCH_CATEGORY_LABELS[a.researchCategory]} · 기준일:{' '}
                            <span className="font-mono">{a.referenceDateUsed || '미상'}</span>
                          </div>
                          <h3 className="text-sm font-semibold text-slate-900 mt-0.5">
                            {a.issueTitle}
                          </h3>
                          <div className="text-slate-600 mt-0.5">
                            대상 조문: {pv?.officialDocumentTitle} {pv?.articleNumber} (
                            {pv?.amendmentNumber})
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-slate-900">현재 상태: {a.status}</div>
                          {a.legalReviewConclusion && (
                            <div className="text-emerald-800 font-semibold mt-0.5">
                              기록된 결론: {a.legalReviewConclusion}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                          <div className="font-semibold text-slate-800 mb-1">수집 원문 발췌</div>
                          <div className="text-slate-800 whitespace-pre-wrap">
                            {a.verbatimSourceExcerpt}
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                          <div className="font-semibold text-slate-800 mb-1">
                            시점 및 부칙 판단 근거
                          </div>
                          <div className="text-slate-800 whitespace-pre-wrap">
                            {a.modelOrRuleAnalysisText}
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                        <div>
                          <label className="block font-medium text-slate-700 mb-1">
                            검토 처분 유형
                          </label>
                          <select
                            value={reviewDecisionType}
                            onChange={(e) =>
                              setReviewDecisionType(
                                e.target.value as ReviewDecision['decisionType']
                              )
                            }
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                          >
                            <option value="APPROVE_CONCLUSION">
                              법무 검토 완료 승인 (결론 확정)
                            </option>
                            <option value="REQUEST_MORE_FACTS">
                              추가 사실·원문 확인 요청 (보류)
                            </option>
                            <option value="FLAG_TRANSITIONAL_REVIEW">
                              부칙·경과조치 심층 재검토 지정
                            </option>
                            <option value="REJECT_ANALYSIS">분석 반려 (재검토 필요)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block font-medium text-slate-700 mb-1">
                            법무 최종 결론 기록 (승인 시 필수)
                          </label>
                          <select
                            value={reviewConclusion || ''}
                            onChange={(e) =>
                              setReviewConclusion(e.target.value as LegalReviewConclusion)
                            }
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                          >
                            <option value="적용">적용</option>
                            <option value="비적용">비적용</option>
                            <option value="조건부 적용(경과조치·종전규정)">
                              조건부 적용(경과조치·종전규정)
                            </option>
                            <option value="판단 보류(추가 사실·원문 확보 필요)">
                              판단 보류(추가 사실·원문 확보 필요)
                            </option>
                          </select>
                        </div>

                        <div>
                          <label className="block font-medium text-slate-700 mb-1">
                            검토 사유 및 법무 의견 (5자 이상 필수)
                          </label>
                          <input
                            type="text"
                            placeholder="예: 부칙 제3조 경과조치 및 대법원 판례에 따라 구법 적용 확인"
                            value={reviewReason}
                            onChange={(e) => setReviewReason(e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                          />
                        </div>

                        <div>
                          <button
                            type="button"
                            onClick={() => handleSubmitLegalReview(a.id)}
                            className="w-full px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded"
                          >
                            법무 검토 결정 등록
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ================= SCREEN H: DATA CONNECTIONS & GOVERNANCE ================= */}
          {activeScreen === 'CONNECTIONS' && (
            <DataConnectionAndGovernanceScreen
              connectors={data.connectorStatuses}
              governancePolicy={data.governancePolicy}
              auditEvents={data.auditEvents}
              currentUser={data.currentUser}
              workspaceMode={workspaceMode}
              onTestMolegApi={async (params) =>
                apiFetch('/api/connectors/moleg/query', {
                  method: 'POST',
                  body: JSON.stringify({ ...params, workspaceMode }),
                })
              }
              onUpdatePolicy={async (updates) => {
                try {
                  await apiFetch('/api/governance/policy', {
                    method: 'PATCH',
                    body: JSON.stringify(updates),
                  });
                  await loadBootstrap();
                  setBannerMessage({
                    type: 'INFO',
                    text: '조직 데이터 처리 정책이 업데이트되었습니다.',
                  });
                } catch (err: unknown) {
                  setBannerMessage({
                    type: 'ERROR',
                    text: err instanceof Error ? err.message : String(err),
                  });
                }
              }}
            />
          )}

          {/* ================= SCREEN I: AMENDMENT IMPACT WORKSPACE ================= */}
          {activeScreen === 'AMENDMENT_IMPACT' && (
            <AmendmentImpactWorkspace
              projects={data.projects}
              assessments={data.assessments}
              provisions={data.provisionVersions}
              governancePolicy={data.governancePolicy}
              onSelectAssessmentInViewer={(id) => {
                setSelectedAssessmentId(id);
                setActiveScreen('EVIDENCE_VIEWER');
              }}
              onOpenUploadAmendmentModal={() => setIsUploadSourceOpen(true)}
            />
          )}

          {/* ================= SECTION 9: KOREAN LEGAL Q&A ================= */}
          {activeScreen === 'AI_QA' && activeProject && (
            <LegalAiEvidenceAssistant
              project={activeProject}
              onAskQuestion={(questionKo) =>
                apiFetch(`/api/projects/${activeProject.id}/ai-assist`, {
                  method: 'POST',
                  body: JSON.stringify({ questionKo }),
                })
              }
            />
          )}

          {/* ================= SECTION 10: REPORTING & PRINT-FRIENDLY VIEW ================= */}
          {activeScreen === 'REPORTING' && activeProject && (
            <div className="space-y-6">
              <div className="no-print flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                  <h1 className="text-lg font-semibold text-slate-900">
                    보고서 생성 및 XLSX·DOCX·PDF 인쇄 출력 (Reporting & Exports)
                  </h1>
                  <p className="text-xs text-slate-600 mt-0.5">
                    경영진 요약, 상세 시점검토 매트릭스, 미확보 증거 요청 목록, 원문 부록, 법무 결재 이력을 포함한 공식 보고서를 생성합니다.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleExportAction('XLSX_MATRIX')}
                    className="px-3.5 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded hover:bg-slate-50"
                  >
                    검토 매트릭스 (.xlsx) 다운로드
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportAction('DOCX_REPORT')}
                    className="px-3.5 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded hover:bg-slate-50"
                  >
                    검토 보고서 (.docx) 다운로드
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportAction('PRINT_PDF_VIEW')}
                    className="px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded hover:bg-slate-800"
                  >
                    인쇄용 PDF 뷰 출력
                  </button>
                </div>
              </div>

              {/* Mandatory Unreviewed Warning Banner */}
              {!allProjectAssessmentsReviewed && (
                <div className="p-4 bg-amber-50 border border-amber-300 rounded text-xs text-amber-950 font-semibold">
                  ▲ [법무 검토 전] 본 프로젝트에는 아직 법무 검토자(법무기획팀)의 '법무 검토 완료' 승인을 받지 않은 항목이나 미확보 원문·미확정 사실이 포함되어 있습니다. 보고서 출력 시 자동으로 완료 처리되지 않으며 모든 내보내기 문서에 '법무 검토 전' 표지가 명시됩니다.
                </div>
              )}

              {/* Print-Friendly Full Report Document */}
              <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-6 text-xs">
                <div className="pb-4 border-b border-slate-200 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold text-slate-500">
                      공공공사 법령 시점검토 공식 보고서
                    </div>
                    <h2 className="text-base font-bold text-slate-900 mt-1">
                      [{activeProject.projectCode}] {activeProject.projectName}
                    </h2>
                    <div className="text-slate-600 mt-1">
                      발주처(계약주체): {activeProject.contractingPrincipal} · 조달대행:{' '}
                      {activeProject.procurementAgency} · 연구 기준일:{' '}
                      <span className="font-mono">{activeProject.researchCutoffDate}</span>
                    </div>
                  </div>
                  <div className="px-3 py-1.5 border border-slate-300 rounded font-semibold text-slate-900">
                    검토 상태 표지: {allProjectAssessmentsReviewed ? '법무 검토 완료' : '법무 검토 전'}
                  </div>
                </div>

                {/* 1. Executive Summary */}
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    1. 경영진 요약 (Executive Summary)
                  </h3>
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded space-y-1 text-slate-800">
                    <div>
                      · 계약 법제 체계 검증 상태:{' '}
                      {CONTRACTING_REGIME_STATUS_LABELS[activeProject.contractingRegimeStatus]} (
                      {CONTRACTING_REGIME_VALUE_LABELS[activeProject.contractingRegimeValue]})
                    </div>
                    <div>
                      · 총 시점검토 항목: {projectAssessments.length}건 (법무 검토 완료:{' '}
                      {projectAssessments.filter((a) => a.status === '법무 검토 완료').length}건 /
                      원문·사실 추가확인 필요:{' '}
                      {projectAssessments.filter((a) => a.status !== '법무 검토 완료').length}건)
                    </div>
                  </div>
                </section>

                {/* 2. Detailed Applicability Review Summary */}
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    2. 상세 시점별 적용 검토 내역
                  </h3>
                  <div className="divide-y divide-slate-200 border border-slate-200 rounded">
                    {projectAssessments.map((a) => {
                      const pv = data.provisionVersions.find(
                        (p) => p.id === a.provisionVersionId
                      );
                      return (
                        <div key={a.id} className="p-3.5 space-y-1.5">
                          <div className="flex items-center justify-between font-semibold text-slate-900">
                            <span>
                              [{RESEARCH_CATEGORY_LABELS[a.researchCategory]}] {a.issueTitle}
                            </span>
                            <span>
                              {a.status}{' '}
                              {a.legalReviewConclusion ? `(${a.legalReviewConclusion})` : '[법무 검토 전]'}
                            </span>
                          </div>
                          <div className="text-slate-600 font-mono text-[11px]">
                            기준일: {a.referenceDateUsed || '미상'} · 조문:{' '}
                            {pv?.officialDocumentTitle} {pv?.articleNumber} ({pv?.amendmentNumber})
                          </div>
                          <div className="text-slate-800">{a.modelOrRuleAnalysisText}</div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* 3. Missing-Evidence Request List */}
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    3. 미확보 원문 및 추가 사실 확인 요청 목록 (Missing-Evidence Request List)
                  </h3>
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded space-y-1 text-amber-950">
                    {projectAssessments.flatMap((a) => a.unresolvedIssues).length === 0 ? (
                      <div>식별된 미확인 사실 또는 미확보 원문이 없습니다.</div>
                    ) : (
                      <ul className="list-disc pl-4 space-y-1">
                        {projectAssessments
                          .flatMap((a) =>
                            a.unresolvedIssues.map((iss) => `[${a.issueTitle}] ${iss}`)
                          )
                          .map((line, idx) => (
                            <li key={idx}>{line}</li>
                          ))}
                      </ul>
                    )}
                  </div>
                </section>

                {/* 4. Source Appendix & 5. Review History */}
                <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded space-y-1.5">
                    <h4 className="font-semibold text-slate-900">4. 법령·계약조건 원문 부록</h4>
                    {data.sourceRecords.map((src) => (
                      <div key={src.id} className="text-[11px] text-slate-700">
                        · {src.officialTitle} (ID: {src.officialSourceId} · 수집시각:{' '}
                        {src.retrievedAt})
                      </div>
                    ))}
                  </div>
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded space-y-1.5">
                    <h4 className="font-semibold text-slate-900">5. 법무 검토 및 결재 이력</h4>
                    {projectDecisions.length === 0 ? (
                      <div className="text-slate-500">기록된 법무 결재 이력 없음 (법무 검토 전)</div>
                    ) : (
                      projectDecisions.map((d) => (
                        <div key={d.id} className="text-[11px] text-slate-700">
                          · [{d.decidedAt}] {d.reviewerName}: {d.resultingStatus} (
                          {d.recordedConclusion}) — {d.reasonText}
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Modals */}
      <NewProjectModal
        isOpen={isNewProjectOpen}
        workspaceMode={workspaceMode}
        onClose={() => setIsNewProjectOpen(false)}
        onSubmit={handleCreateProject}
      />

      <AddEventModal
        isOpen={isAddEventOpen}
        documents={projectDocuments}
        onClose={() => setIsAddEventOpen(false)}
        onSubmit={handleAddEvent}
      />

      <UploadHistoricalSourceModal
        isOpen={isUploadSourceOpen}
        workspaceMode={workspaceMode}
        existingProvisions={data.provisionVersions}
        onClose={() => setIsUploadSourceOpen(false)}
        onSubmit={handleUploadHistoricalSource}
      />
    </div>
  );
}
