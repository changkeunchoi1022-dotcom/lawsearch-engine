import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { dbStore } from './src/server/persistentStore.ts';
import {
  applyLegalReviewDecision,
  authorizeProjectAccess,
  flagAssessmentsAffectedByAmendment,
  invalidateAssessmentsOnFactChange,
  runStageAHistoricalRetrieval,
  runStageBApplicabilityEvaluation,
  validateWorkspaceIsolation,
} from './src/engine/applicabilityEngine.ts';
import { ingestDocumentAndExtractCandidates } from './src/engine/documentIngestion.ts';
import {
  getConnectorStatuses,
  queryLawGoKrOpenApi,
  validateAllowlistedSourceUrl,
} from './src/engine/lawGoKrConnector.ts';
import { runEvidenceBasedLegalAssist } from './src/server/geminiService.ts';
import {
  ApplicabilityRule,
  AppUser,
  ContractingRegimeStatus,
  ContractingRegimeValue,
  ContractorRole,
  DatePrecision,
  DocumentCategory,
  EventConfirmationStatus,
  InstitutionCategory,
  LongTermStructureType,
  Project,
  ProjectEvent,
  ProjectEventType,
  ProvisionVersion,
  SourceRecord,
  UserRole,
  VatTreatment,
  WorkspaceMode,
} from './src/types/legalDomain.ts';
import { SYNTHETIC_WARNING_LABEL } from './src/data/seedData.ts';

const PORT = 3000;

function resolveCurrentUser(req: Request): AppUser {
  const state = dbStore.getState();
  const headerUserId = (req.headers['x-actor-user-id'] as string) || 'user-legal-01';
  const found = state.users.find((u) => u.id === headerUserId);
  return found || state.users[0];
}

function getKstNowIso(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).replace(' ', 'T') + '+09:00';
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // 1. Bootstrap endpoint (filters by workspaceMode and user's RBAC project permissions)
  app.get('/api/bootstrap', (req: Request, res: Response) => {
    const user = resolveCurrentUser(req);
    const workspaceMode: WorkspaceMode =
      req.query.workspaceMode === WorkspaceMode.DEMO
        ? WorkspaceMode.DEMO
        : WorkspaceMode.PRODUCTION;

    const state = dbStore.getState();

    // Filter projects by workspaceMode and RBAC access
    const accessibleProjects = state.projects.filter((p) => {
      if (p.workspaceMode !== workspaceMode) return false;
      const check = authorizeProjectAccess(user, p, 'READ');
      return check.allowed;
    });

    const accessibleProjectIds = new Set(accessibleProjects.map((p) => p.id));

    res.json({
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
    });
  });

  // 2. Create Project (Project Intake)
  app.post('/api/projects', (req: Request, res: Response) => {
    const user = resolveCurrentUser(req);
    if (user.role === UserRole.READ_ONLY_EXECUTIVE) {
      res.status(403).json({
        errorKo: '권한 거부: 경영진 열람 전용 계정은 신규 프로젝트를 생성할 수 없습니다.',
      });
      return;
    }

    const body = req.body || {};
    const workspaceMode: WorkspaceMode =
      body.workspaceMode === WorkspaceMode.DEMO ? WorkspaceMode.DEMO : WorkspaceMode.PRODUCTION;
    const nowKst = getKstNowIso();
    const newId = `proj-${workspaceMode.toLowerCase()}-${Date.now()}`;

    const newProject: Project = {
      id: newId,
      projectCode: (body.projectCode || `PRJ-${Date.now().toString().slice(-4)}`).trim(),
      projectName: (body.projectName || '신규 공공건설공사 시점검토 프로젝트').trim(),
      workspaceMode,
      syntheticWarning:
        workspaceMode === WorkspaceMode.DEMO ? SYNTHETIC_WARNING_LABEL : undefined,
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
      incorporatedDocuments: Array.isArray(body.incorporatedDocuments)
        ? body.incorporatedDocuments
        : [],
      contractingRegimeStatus:
        body.contractingRegimeStatus || ContractingRegimeStatus.UNRESOLVED,
      contractingRegimeValue:
        body.contractingRegimeValue || ContractingRegimeValue.UNRESOLVED,
      contractingRegimeVerificationNote: (
        body.contractingRegimeVerificationNote ||
        '기관명 또는 조달청 관여 여부만으로 법제 체계를 단정하지 않으며, 근거 규정 및 편입 계약조건 확인 필요'
      ).trim(),
      siteManager: (body.siteManager || '').trim(),
      contractManager: (body.contractManager || user.name).trim(),
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

    dbStore.mutate((draft) => {
      draft.projects.unshift(newProject);
      draft.users.forEach((u) => {
        if (
          (u.id === user.id || u.role === UserRole.LEGAL_REVIEWER) &&
          !u.assignedProjectIds.includes('*') &&
          !u.assignedProjectIds.includes(newProject.id)
        ) {
          u.assignedProjectIds.push(newProject.id);
        }
      });
    });

    dbStore.appendAuditEvent({
      workspaceMode,
      projectId: newProject.id,
      eventType: 'FACT_CHANGE',
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      targetEntityType: 'Project',
      targetEntityId: newProject.id,
      summary: `신규 프로젝트 등록: [${newProject.projectCode}] ${newProject.projectName}`,
      beforeSnapshot: null,
      afterSnapshot: newProject.contractingRegimeStatus,
    });

    res.status(201).json({ project: newProject });
  });

  // 3. Update Project / Verify Contracting Regime
  app.patch('/api/projects/:projectId', (req: Request, res: Response) => {
    const user = resolveCurrentUser(req);
    const { projectId } = req.params;
    const state = dbStore.getState();
    const project = state.projects.find((p) => p.id === projectId);

    if (!project) {
      res.status(404).json({ errorKo: '대상 프로젝트를 찾을 수 없습니다.' });
      return;
    }

    const authCheck = authorizeProjectAccess(user, project, 'WRITE');
    if (!authCheck.allowed) {
      dbStore.appendAuditEvent({
        workspaceMode: project.workspaceMode,
        projectId: project.id,
        eventType: 'UNAUTHORIZED_ACCESS_BLOCKED',
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        targetEntityType: 'Project',
        targetEntityId: project.id,
        summary: authCheck.errorKo || '프로젝트 수정 권한 거부',
        beforeSnapshot: null,
        afterSnapshot: null,
      });
      res.status(authCheck.statusCode).json({ errorKo: authCheck.errorKo });
      return;
    }

    const updates = req.body || {};
    const regimeChanged =
      (updates.contractingRegimeStatus &&
        updates.contractingRegimeStatus !== project.contractingRegimeStatus) ||
      (updates.contractingRegimeValue &&
        updates.contractingRegimeValue !== project.contractingRegimeValue) ||
      (updates.totalContractAmountKrw !== undefined &&
        updates.totalContractAmountKrw !== project.totalContractAmountKrw);

    const nowKst = getKstNowIso();
    let updatedProject!: Project;

    dbStore.mutate((draft) => {
      const idx = draft.projects.findIndex((p) => p.id === projectId);
      if (idx === -1) return;
      updatedProject = {
        ...draft.projects[idx],
        ...updates,
        id: project.id,
        workspaceMode: project.workspaceMode,
        updatedAt: nowKst,
      };
      draft.projects[idx] = updatedProject;

      if (regimeChanged) {
        draft.assessments = draft.assessments.map((a) => {
          if (a.projectId !== projectId) return a;
          return {
            ...a,
            status: '재검토 필요',
            unresolvedIssues: [
              `프로젝트 기본 정보(계약 법제 체계 또는 총계약금액) 변경으로 인한 재검토 필요 (${nowKst})`,
              ...a.unresolvedIssues,
            ],
            updatedAt: nowKst,
          };
        });
      }
    });

    dbStore.appendAuditEvent({
      workspaceMode: project.workspaceMode,
      projectId: project.id,
      eventType: 'FACT_CHANGE',
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      targetEntityType: 'Project',
      targetEntityId: project.id,
      summary: `프로젝트 정보 및 계약 법제 체계 업데이트 (${updatedProject.contractingRegimeStatus} / ${updatedProject.contractingRegimeValue})`,
      beforeSnapshot: `${project.contractingRegimeStatus}:${project.contractingRegimeValue}`,
      afterSnapshot: `${updatedProject.contractingRegimeStatus}:${updatedProject.contractingRegimeValue}`,
    });

    res.json({ project: updatedProject });
  });

  // 4. Add or Update Project Event (Separate dates & evidence per event)
  app.post('/api/projects/:projectId/events', (req: Request, res: Response) => {
    const user = resolveCurrentUser(req);
    const { projectId } = req.params;
    const state = dbStore.getState();
    const project = state.projects.find((p) => p.id === projectId);

    if (!project) {
      res.status(404).json({ errorKo: '프로젝트를 찾을 수 없습니다.' });
      return;
    }

    const authCheck = authorizeProjectAccess(user, project, 'WRITE');
    if (!authCheck.allowed) {
      res.status(authCheck.statusCode).json({ errorKo: authCheck.errorKo });
      return;
    }

    const body = req.body || {};
    const nowKst = getKstNowIso();
    const isConfirmed = body.confirmationStatus === EventConfirmationStatus.CONFIRMED;
    const newEvent: ProjectEvent = {
      id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      projectId: project.id,
      workspaceMode: project.workspaceMode,
      eventType: body.eventType || ProjectEventType.CUSTOM_EVENT,
      eventTitle: (body.eventTitle || '신규 공사 이벤트').trim(),
      eventDate: body.eventDate ? String(body.eventDate).trim() : null,
      datePrecision: body.eventDate
        ? body.datePrecision || DatePrecision.EXACT_DAY
        : DatePrecision.UNKNOWN,
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

    dbStore.mutate((draft) => {
      draft.events.push(newEvent);
    });

    dbStore.appendAuditEvent({
      workspaceMode: project.workspaceMode,
      projectId: project.id,
      eventType: 'FACT_CHANGE',
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      targetEntityType: 'ProjectEvent',
      targetEntityId: newEvent.id,
      summary: `공사 이벤트 등록: [${newEvent.eventTitle}] 일자: ${newEvent.eventDate || '미상'} (${newEvent.confirmationStatus})`,
      beforeSnapshot: null,
      afterSnapshot: `${newEvent.eventDate || 'UNKNOWN'} (${newEvent.confirmationStatus})`,
    });

    res.status(201).json({ event: newEvent });
  });

  app.patch('/api/projects/:projectId/events/:eventId', (req: Request, res: Response) => {
    const user = resolveCurrentUser(req);
    const { projectId, eventId } = req.params;
    const state = dbStore.getState();
    const project = state.projects.find((p) => p.id === projectId);
    const existingEvent = state.events.find((e) => e.id === eventId && e.projectId === projectId);

    if (!project || !existingEvent) {
      res.status(404).json({ errorKo: '대상 프로젝트 또는 이벤트를 찾을 수 없습니다.' });
      return;
    }

    const authCheck = authorizeProjectAccess(user, project, 'WRITE');
    if (!authCheck.allowed) {
      res.status(authCheck.statusCode).json({ errorKo: authCheck.errorKo });
      return;
    }

    const body = req.body || {};
    const nowKst = getKstNowIso();
    const dateChanged =
      body.eventDate !== undefined && body.eventDate !== existingEvent.eventDate;

    let updatedEvent!: ProjectEvent;

    dbStore.mutate((draft) => {
      const idx = draft.events.findIndex((e) => e.id === eventId);
      if (idx === -1) return;
      const nextStatus = body.confirmationStatus ?? existingEvent.confirmationStatus;
      updatedEvent = {
        ...draft.events[idx],
        ...body,
        confirmedBy:
          nextStatus === EventConfirmationStatus.CONFIRMED
            ? user.name
            : draft.events[idx].confirmedBy,
        confirmedAt:
          nextStatus === EventConfirmationStatus.CONFIRMED
            ? nowKst
            : draft.events[idx].confirmedAt,
        updatedAt: nowKst,
      };
      draft.events[idx] = updatedEvent;

      if (dateChanged) {
        draft.assessments = invalidateAssessmentsOnFactChange(
          draft.assessments,
          eventId,
          `이벤트 [${existingEvent.eventTitle}] 일자가 ${existingEvent.eventDate || '미상'}에서 ${
            updatedEvent.eventDate || '미상'
          }(으)로 변경됨`
        );
      }
    });

    dbStore.appendAuditEvent({
      workspaceMode: project.workspaceMode,
      projectId: project.id,
      eventType: dateChanged ? 'ASSESSMENT_INVALIDATED' : 'FACT_CHANGE',
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      targetEntityType: 'ProjectEvent',
      targetEntityId: eventId,
      summary: `공사 이벤트 업데이트: [${updatedEvent.eventTitle}] (${updatedEvent.eventDate || '미상'}, 상태: ${updatedEvent.confirmationStatus})`,
      beforeSnapshot: `${existingEvent.eventDate || 'UNKNOWN'} (${existingEvent.confirmationStatus})`,
      afterSnapshot: `${updatedEvent.eventDate || 'UNKNOWN'} (${updatedEvent.confirmationStatus})`,
    });

    res.json({ event: updatedEvent });
  });

  // 5. Document Ingestion & Candidate Fact Extraction
  app.post('/api/projects/:projectId/documents', (req: Request, res: Response) => {
    const user = resolveCurrentUser(req);
    const { projectId } = req.params;
    const state = dbStore.getState();
    const project = state.projects.find((p) => p.id === projectId);

    if (!project) {
      res.status(404).json({ errorKo: '프로젝트를 찾을 수 없습니다.' });
      return;
    }

    const authCheck = authorizeProjectAccess(user, project, 'WRITE');
    if (!authCheck.allowed) {
      res.status(authCheck.statusCode).json({ errorKo: authCheck.errorKo });
      return;
    }

    const body = req.body || {};
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

    dbStore.mutate((draft) => {
      draft.documents.unshift(result.document);
      draft.facts.unshift(...result.candidateFacts);
      draft.events.push(...result.candidateEvents);
    });

    dbStore.appendAuditEvent({
      workspaceMode: project.workspaceMode,
      projectId: project.id,
      eventType: 'FACT_CHANGE',
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      targetEntityType: 'Document',
      targetEntityId: result.document.id,
      summary: `문서 업로드 및 후보 사실 추출: ${result.document.originalFilename} (해시: ${result.document.fileHashSha256.slice(
        0,
        20
      )}..., 추출 후보 사실 ${result.candidateFacts.length}건, 판독불가 스캔 여부: ${
        result.document.isUnreadableScan ? '예' : '아니오'
      })`,
      beforeSnapshot: null,
      afterSnapshot: result.document.fileHashSha256,
    });

    res.status(201).json(result);
  });

  // 6. Confirm / Edit / Reject Candidate Fact (with User Correction Log & Dependency Invalidation)
  app.patch('/api/projects/:projectId/facts/:factId', (req: Request, res: Response) => {
    const user = resolveCurrentUser(req);
    const { projectId, factId } = req.params;
    const state = dbStore.getState();
    const project = state.projects.find((p) => p.id === projectId);
    const existingFact = state.facts.find((f) => f.id === factId && f.projectId === projectId);

    if (!project || !existingFact) {
      res.status(404).json({ errorKo: '프로젝트 또는 사실 항목을 찾을 수 없습니다.' });
      return;
    }

    const authCheck = authorizeProjectAccess(user, project, 'WRITE');
    if (!authCheck.allowed) {
      res.status(authCheck.statusCode).json({ errorKo: authCheck.errorKo });
      return;
    }

    const body = req.body || {};
    const nowKst = getKstNowIso();
    const valueChanged = body.value !== undefined && body.value !== existingFact.value;
    let updatedFact!: typeof existingFact;

    dbStore.mutate((draft) => {
      const idx = draft.facts.findIndex((f) => f.id === factId);
      if (idx === -1) return;

      const nextStatus = body.status ?? existingFact.status;
      updatedFact = {
        ...draft.facts[idx],
        ...body,
        confirmedBy: nextStatus === 'CONFIRMED' ? user.name : draft.facts[idx].confirmedBy,
        confirmedAt: nextStatus === 'CONFIRMED' ? nowKst : draft.facts[idx].confirmedAt,
        updatedAt: nowKst,
      };
      draft.facts[idx] = updatedFact;

      // Record user correction in source document if value was modified
      if (valueChanged && existingFact.sourceDocumentId) {
        const docIdx = draft.documents.findIndex((d) => d.id === existingFact.sourceDocumentId);
        if (docIdx !== -1) {
          draft.documents[docIdx].userCorrectionsLog.push({
            field: existingFact.label,
            before: existingFact.value,
            after: String(body.value),
            correctedBy: user.name,
            correctedAt: nowKst,
          });
        }
      }

      // If a previously confirmed fact changed value, invalidate dependent assessments
      if (existingFact.status === 'CONFIRMED' && valueChanged) {
        draft.assessments = invalidateAssessmentsOnFactChange(
          draft.assessments,
          factId,
          `사실 항목 [${existingFact.label}] 값이 "${existingFact.value}"에서 "${updatedFact.value}"(으)로 수정됨`
        );
      }
    });

    dbStore.appendAuditEvent({
      workspaceMode: project.workspaceMode,
      projectId: project.id,
      eventType: valueChanged ? 'ASSESSMENT_INVALIDATED' : 'FACT_CHANGE',
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      targetEntityType: 'Fact',
      targetEntityId: factId,
      summary: `추출 사실 검토 처리: [${updatedFact.label}] = "${updatedFact.value}" (상태: ${updatedFact.status})`,
      beforeSnapshot: `${existingFact.value} (${existingFact.status})`,
      afterSnapshot: `${updatedFact.value} (${updatedFact.status})`,
    });

    res.json({ fact: updatedFact });
  });

  // 7. Manual Official Historical Source & Provision Upload (also supports Amendment Impact detection)
  app.post('/api/sources/manual', (req: Request, res: Response) => {
    const user = resolveCurrentUser(req);
    if (user.role === UserRole.READ_ONLY_EXECUTIVE) {
      res.status(403).json({
        errorKo: '권한 거부: 경영진 열람 전용 계정은 법령 원문을 등록할 수 없습니다.',
      });
      return;
    }

    const body = req.body || {};
    const workspaceMode: WorkspaceMode =
      body.workspaceMode === WorkspaceMode.DEMO ? WorkspaceMode.DEMO : WorkspaceMode.PRODUCTION;

    if (body.officialUrlOrFileRef && String(body.officialUrlOrFileRef).startsWith('http')) {
      const ssrf = validateAllowlistedSourceUrl(String(body.officialUrlOrFileRef));
      if (!ssrf.allowed) {
        res.status(400).json({ errorKo: ssrf.errorKo });
        return;
      }
    }

    const nowKst = getKstNowIso();
    const newSource: SourceRecord = {
      id: `src-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      officialSourceId: (body.officialSourceId || `MANUAL-ID-${Date.now()}`).trim(),
      workspaceMode,
      syntheticLabel:
        workspaceMode === WorkspaceMode.DEMO ? SYNTHETIC_WARNING_LABEL : undefined,
      connectorId: 'AGENCY_AUTHENTICATED_UPLOAD',
      sourceCategory: body.sourceCategory || 'ENFORCEMENT_DECREE',
      officialTitle: (body.officialDocumentTitle || '수동 업로드 법령·계약예규').trim(),
      issuingAuthority: (body.issuingAuthority || '소관부처').trim(),
      officialUrlOrFileRef: (body.officialUrlOrFileRef || '수동 업로드 공인 원문 파일').trim(),
      retrievedAt: nowKst,
      hasFullHistoricalText: Boolean(body.verbatimKoreanText && String(body.verbatimKoreanText).trim()),
      missingAttachments: Array.isArray(body.missingAttachments) ? body.missingAttachments : [],
    };

    const newProvision: ProvisionVersion = {
      id: `pv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      instrumentId: body.instrumentId || 'inst-prod-local-decree',
      sourceRecordId: newSource.id,
      officialMstOrVersionId: (body.officialMstOrVersionId || newSource.officialSourceId).trim(),
      workspaceMode,
      syntheticLabel:
        workspaceMode === WorkspaceMode.DEMO ? SYNTHETIC_WARNING_LABEL : undefined,
      officialDocumentTitle: newSource.officialTitle,
      sourceCategory: newSource.sourceCategory,
      issuingAuthority: newSource.issuingAuthority,
      articleNumber: (body.articleNumber || '제1조').trim(),
      articleTitle: (body.articleTitle || '조문 제목').trim(),
      promulgationDate: body.promulgationDate || null,
      generalEffectiveDate: body.generalEffectiveDate || null,
      provisionEffectiveDate: body.provisionEffectiveDate || body.generalEffectiveDate || null,
      validUntilDate: body.validUntilDate || null,
      amendmentType: (body.amendmentType || '일부개정').trim(),
      amendmentNumber: (body.amendmentNumber || '제00000호').trim(),
      verbatimKoreanText: String(body.verbatimKoreanText || ''),
      isHistoricalTextMissing: !body.verbatimKoreanText || !String(body.verbatimKoreanText).trim(),
      supplementaryProvisionsText: String(body.supplementaryProvisionsText || ''),
      applicationClauseText: String(body.applicationClauseText || ''),
      transitionalProvisionText: String(body.transitionalProvisionText || ''),
      referencedAttachments: Array.isArray(body.referencedAttachments)
        ? body.referencedAttachments
        : [],
      precedentOrInterpretationDependency: body.precedentOrInterpretationDependency || {
        required: false,
        description: '',
        authoritySourceRetrieved: true,
      },
      priorVersionId: body.priorVersionId || null,
    };

    const newRule: ApplicabilityRule = {
      id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      provisionVersionId: newProvision.id,
      workspaceMode,
      ruleName: `${newProvision.officialDocumentTitle} ${newProvision.articleNumber} (${newProvision.amendmentNumber})`,
      issueTitle: (body.issueTitle || `${newProvision.articleTitle} 적용 여부`).trim(),
      researchCategory: body.researchCategory || 'LOCAL_GOVERNMENT_CONTRACT',
      approvalStatus:
        user.role === UserRole.LEGAL_REVIEWER ? 'VERIFIED_BY_HUMAN' : 'PROPOSED_BY_AI',
      approvedBy: user.role === UserRole.LEGAL_REVIEWER ? user.name : null,
      approvedAt: user.role === UserRole.LEGAL_REVIEWER ? nowKst : null,
      targetEventTypes: [body.targetEventType || ProjectEventType.DESIGN_CHANGE_INSTRUCTION_APPROVAL],
      requiredRegimes: body.requiredRegime ? [body.requiredRegime] : [],
      excludedRegimes: [],
      minThresholdAmountKrw:
        typeof body.minThresholdAmountKrw === 'number' ? body.minThresholdAmountKrw : null,
      maxThresholdAmountKrw: null,
      requiredLocationKeywords: [],
      effectiveDateTriggerType: body.effectiveDateTriggerType || 'EVENT_FACTUAL_TRIGGER_DATE',
      boundaryComparison: body.boundaryComparison || 'ON_OR_AFTER',
      referenceBoundaryDate:
        newProvision.provisionEffectiveDate ||
        newProvision.generalEffectiveDate ||
        '2025-01-01',
      hasTransitionalPreservationOfPriorRule: Boolean(body.hasTransitionalPreservationOfPriorRule),
      preservedPriorProvisionVersionId: body.priorVersionId || null,
      transitionalConditionDescription: String(body.transitionalProvisionText || ''),
      requiresPrecedentOrInterpretation: false,
    };

    dbStore.mutate((draft) => {
      draft.sourceRecords.unshift(newSource);
      draft.provisionVersions.unshift(newProvision);
      draft.rules.unshift(newRule);

      if (newProvision.priorVersionId) {
        draft.assessments = flagAssessmentsAffectedByAmendment(
          draft.assessments,
          newProvision.priorVersionId,
          newProvision
        );
      }
    });

    dbStore.appendAuditEvent({
      workspaceMode,
      projectId: null,
      eventType: 'SOURCE_RETRIEVAL',
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      targetEntityType: 'ProvisionVersion',
      targetEntityId: newProvision.id,
      summary: `공식 연혁 조문 수동 등록: [${newProvision.officialDocumentTitle} ${newProvision.articleNumber}] (${newProvision.amendmentNumber}, 시행일: ${
        newProvision.provisionEffectiveDate || newProvision.generalEffectiveDate || '미상'
      })`,
      beforeSnapshot: newProvision.priorVersionId,
      afterSnapshot: newProvision.id,
    });

    res.status(201).json({
      sourceRecord: newSource,
      provisionVersion: newProvision,
      rule: newRule,
    });
  });

  // 8. Live National Law Information Center (open.law.go.kr DRF) Connector Endpoint
  app.post('/api/connectors/moleg/query', async (req: Request, res: Response) => {
    const user = resolveCurrentUser(req);
    const body = req.body || {};

    const outcome = await queryLawGoKrOpenApi({
      mode: body.mode === 'SERVICE' ? 'SERVICE' : 'SEARCH',
      target: body.target || 'law',
      query: body.query,
      mst: body.mst,
      id: body.id,
      efYd: body.efYd,
      simulatedFailureMode: body.simulatedFailureMode,
    });

    if (outcome.ok) {
      dbStore.mutate((draft) => {
        draft.lastMolegRetrievalAt = outcome.retrievedAt;
      });
    }

    dbStore.appendAuditEvent({
      workspaceMode:
        body.workspaceMode === WorkspaceMode.DEMO ? WorkspaceMode.DEMO : WorkspaceMode.PRODUCTION,
      projectId: body.projectId || null,
      eventType: 'SOURCE_RETRIEVAL',
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      targetEntityType: 'Connector:MOLEG_OPEN_API',
      targetEntityId: body.target || 'law',
      summary: `국가법령정보센터 DRF 호출 (${body.mode || 'SEARCH'} / target=${body.target || 'law'}): ${outcome.messageKo}`,
      beforeSnapshot: null,
      afterSnapshot: outcome.ok ? 'SUCCESS' : outcome.errorCode || 'FAILED',
    });

    res.json(outcome);
  });

  // 9. Run Two-Stage Applicability Engine (Stage A + Stage B)
  app.post('/api/projects/:projectId/evaluate', (req: Request, res: Response) => {
    const user = resolveCurrentUser(req);
    const { projectId } = req.params;
    const state = dbStore.getState();
    const project = state.projects.find((p) => p.id === projectId);

    if (!project) {
      res.status(404).json({ errorKo: '프로젝트를 찾을 수 없습니다.' });
      return;
    }

    const authCheck = authorizeProjectAccess(user, project, 'WRITE');
    if (!authCheck.allowed) {
      res.status(authCheck.statusCode).json({ errorKo: authCheck.errorKo });
      return;
    }

    const { eventId, provisionVersionId, ruleId } = req.body || {};
    const targetEvent = state.events.find((e) => e.id === eventId && e.projectId === projectId);
    const candidateProvision = state.provisionVersions.find((pv) => pv.id === provisionVersionId);

    if (!targetEvent || !candidateProvision) {
      res.status(400).json({
        errorKo: '검토 대상 공사 이벤트와 후보 법령 조문 버전을 모두 선택해야 합니다.',
      });
      return;
    }

    // Strict Workspace Isolation Check
    const iso = validateWorkspaceIsolation(
      project.workspaceMode,
      candidateProvision.workspaceMode,
      candidateProvision.syntheticLabel
    );
    if (!iso.valid) {
      res.status(400).json({ errorKo: iso.errorKo });
      return;
    }

    const matchedRule =
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
      state.provisionVersions.filter(
        (pv) => pv.instrumentId === candidateProvision.instrumentId
      ),
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

    dbStore.mutate((draft) => {
      draft.assessments.unshift(assessment);
    });

    dbStore.appendAuditEvent({
      workspaceMode: project.workspaceMode,
      projectId: project.id,
      eventType: 'ASSESSMENT_CREATED',
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      targetEntityType: 'ApplicabilityAssessment',
      targetEntityId: assessment.id,
      summary: `2단계 시점별 적용성 평가 생성: [${assessment.issueTitle}] → 판정 상태: [${assessment.status}]`,
      beforeSnapshot: null,
      afterSnapshot: assessment.status,
    });

    res.status(201).json({ assessment, stageA });
  });

  // 10. Legal Review Decision (Restricted to LEGAL_REVIEWER role for '법무 검토 완료')
  app.post('/api/assessments/:assessmentId/review', (req: Request, res: Response) => {
    const user = resolveCurrentUser(req);
    const { assessmentId } = req.params;
    const state = dbStore.getState();
    const assessment = state.assessments.find((a) => a.id === assessmentId);

    if (!assessment) {
      res.status(404).json({ errorKo: '검토 대상 평가 항목을 찾을 수 없습니다.' });
      return;
    }

    const project = state.projects.find((p) => p.id === assessment.projectId);
    if (!project) {
      res.status(404).json({ errorKo: '소속 프로젝트를 찾을 수 없습니다.' });
      return;
    }

    const authCheck = authorizeProjectAccess(user, project, 'LEGAL_APPROVE');
    if (!authCheck.allowed) {
      dbStore.appendAuditEvent({
        workspaceMode: project.workspaceMode,
        projectId: project.id,
        eventType: 'UNAUTHORIZED_ACCESS_BLOCKED',
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        targetEntityType: 'ApplicabilityAssessment',
        targetEntityId: assessmentId,
        summary: authCheck.errorKo || '법무 검토 권한 없는 사용자의 승인 시도 차단',
        beforeSnapshot: assessment.status,
        afterSnapshot: null,
      });
      res.status(authCheck.statusCode).json({ errorKo: authCheck.errorKo });
      return;
    }

    try {
      const { decisionType, recordedConclusion, reasonText } = req.body || {};
      const { updatedAssessment, decisionRecord } = applyLegalReviewDecision(
        assessment,
        user,
        decisionType,
        recordedConclusion,
        reasonText
      );

      dbStore.mutate((draft) => {
        const idx = draft.assessments.findIndex((a) => a.id === assessmentId);
        if (idx !== -1) {
          draft.assessments[idx] = updatedAssessment;
        }
        draft.reviewDecisions.unshift(decisionRecord);
      });

      dbStore.appendAuditEvent({
        workspaceMode: project.workspaceMode,
        projectId: project.id,
        eventType: 'LEGAL_REVIEW_DECISION',
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        targetEntityType: 'ApplicabilityAssessment',
        targetEntityId: assessmentId,
        summary: `법무 검토 결정 등록: [${updatedAssessment.status}] 결론: [${
          updatedAssessment.legalReviewConclusion || '미지정'
        }] — 사유: ${decisionRecord.reasonText}`,
        beforeSnapshot: assessment.status,
        afterSnapshot: `${updatedAssessment.status} (${updatedAssessment.legalReviewConclusion || ''})`,
      });

      res.json({ assessment: updatedAssessment, decision: decisionRecord });
    } catch (err: unknown) {
      res.status(400).json({
        errorKo: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 11. Human Approval of AI-Proposed Rule
  app.patch('/api/rules/:ruleId/approve', (req: Request, res: Response) => {
    const user = resolveCurrentUser(req);
    if (user.role !== UserRole.LEGAL_REVIEWER) {
      res.status(403).json({
        errorKo: '권한 거부: 추출된 법령 규칙(Rule)의 검증 승인은 법무 검토자(LEGAL_REVIEWER)만 수행할 수 있습니다.',
      });
      return;
    }

    const { ruleId } = req.params;
    const nowKst = getKstNowIso();
    let updatedRule: ApplicabilityRule | undefined;

    dbStore.mutate((draft) => {
      const idx = draft.rules.findIndex((r) => r.id === ruleId);
      if (idx === -1) return;
      draft.rules[idx] = {
        ...draft.rules[idx],
        approvalStatus: 'VERIFIED_BY_HUMAN',
        approvedBy: user.name,
        approvedAt: nowKst,
      };
      updatedRule = draft.rules[idx];
    });

    if (!updatedRule) {
      res.status(404).json({ errorKo: '규칙을 찾을 수 없습니다.' });
      return;
    }

    dbStore.appendAuditEvent({
      workspaceMode: updatedRule.workspaceMode,
      projectId: null,
      eventType: 'RULE_APPROVAL',
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      targetEntityType: 'ApplicabilityRule',
      targetEntityId: updatedRule.id,
      summary: `법령 적용 요건 규칙(Rule) 법무 검증 완료: ${updatedRule.ruleName}`,
      beforeSnapshot: 'PROPOSED_BY_AI',
      afterSnapshot: 'VERIFIED_BY_HUMAN',
    });

    res.json({ rule: updatedRule });
  });

  // 12. Evidence-Based Korean Q&A and AI Assistance
  app.post('/api/projects/:projectId/ai-assist', async (req: Request, res: Response) => {
    const user = resolveCurrentUser(req);
    const { projectId } = req.params;
    const state = dbStore.getState();
    const project = state.projects.find((p) => p.id === projectId);

    if (!project) {
      res.status(404).json({ errorKo: '프로젝트를 찾을 수 없습니다.' });
      return;
    }

    const authCheck = authorizeProjectAccess(user, project, 'READ');
    if (!authCheck.allowed) {
      res.status(authCheck.statusCode).json({ errorKo: authCheck.errorKo });
      return;
    }

    const questionKo = String(req.body?.questionKo || '').trim();
    if (!questionKo) {
      res.status(400).json({ errorKo: '검토 질문을 입력하십시오.' });
      return;
    }

    const projectEvents = state.events.filter((e) => e.projectId === project.id);
    const confirmedFacts = state.facts.filter(
      (f) => f.projectId === project.id && f.status === 'CONFIRMED'
    );
    const projectAssessments = state.assessments.filter((a) => a.projectId === project.id);
    const projectDocuments = state.documents.filter((d) => d.projectId === project.id);
    const workspaceProvisions = state.provisionVersions.filter(
      (pv) => pv.workspaceMode === project.workspaceMode
    );

    const assistResult = await runEvidenceBasedLegalAssist({
      questionKo,
      project,
      events: projectEvents,
      confirmedFacts,
      provisions: workspaceProvisions,
      assessments: projectAssessments,
      documents: projectDocuments,
      allowExternalAiContractProcessing:
        state.governancePolicy.allowExternalAiContractProcessing,
    });

    res.json(assistResult);
  });

  // 13. Record Report Export (XLSX / DOCX / Print PDF)
  app.post('/api/projects/:projectId/exports', (req: Request, res: Response) => {
    const user = resolveCurrentUser(req);
    const { projectId } = req.params;
    const state = dbStore.getState();
    const project = state.projects.find((p) => p.id === projectId);

    if (!project) {
      res.status(404).json({ errorKo: '프로젝트를 찾을 수 없습니다.' });
      return;
    }

    const authCheck = authorizeProjectAccess(user, project, 'READ');
    if (!authCheck.allowed) {
      res.status(authCheck.statusCode).json({ errorKo: authCheck.errorKo });
      return;
    }

    const projectAssessments = state.assessments.filter((a) => a.projectId === project.id);
    const allApproved =
      projectAssessments.length > 0 &&
      projectAssessments.every((a) => a.status === '법무 검토 완료');
    const unresolvedCount = projectAssessments.reduce(
      (acc, cur) => acc + cur.unresolvedIssues.length,
      0
    );

    const nowKst = getKstNowIso();
    const exportRecord = {
      id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      projectId: project.id,
      workspaceMode: project.workspaceMode,
      exportFormat: req.body?.exportFormat || 'XLSX_MATRIX',
      selectedEventIds: Array.isArray(req.body?.selectedEventIds)
        ? req.body.selectedEventIds
        : state.events.filter((e) => e.projectId === project.id).map((e) => e.id),
      researchCutoffDate: project.researchCutoffDate,
      generatedAt: nowKst,
      generatedBy: `${user.name} (${user.department})`,
      approvalStatusBanner: (allApproved ? '법무 검토 완료' : '법무 검토 전') as
        | '법무 검토 완료'
        | '법무 검토 전',
      unresolvedIssueCount: unresolvedCount,
    };

    dbStore.mutate((draft) => {
      draft.exportRecords.unshift(exportRecord);
    });

    dbStore.appendAuditEvent({
      workspaceMode: project.workspaceMode,
      projectId: project.id,
      eventType: 'REPORT_EXPORT',
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      targetEntityType: 'ExportRecord',
      targetEntityId: exportRecord.id,
      summary: `검토 보고서 내보내기 (${exportRecord.exportFormat}) — 표지 상태: [${exportRecord.approvalStatusBanner}], 미확인 쟁점 ${unresolvedCount}건 포함`,
      beforeSnapshot: null,
      afterSnapshot: exportRecord.approvalStatusBanner,
    });

    res.status(201).json({ exportRecord });
  });

  // 14. Governance Policy & On-Demand Amendment Check
  app.patch('/api/governance/policy', (req: Request, res: Response) => {
    const user = resolveCurrentUser(req);
    if (user.role !== UserRole.ADMIN) {
      res.status(403).json({
        errorKo: '권한 거부: 데이터 처리 정책 및 보존 주기는 시스템 관리자(ADMIN)만 변경할 수 있습니다.',
      });
      return;
    }

    const body = req.body || {};
    dbStore.mutate((draft) => {
      if (typeof body.allowExternalAiContractProcessing === 'boolean') {
        draft.governancePolicy.allowExternalAiContractProcessing =
          body.allowExternalAiContractProcessing;
      }
      if (typeof body.retentionDays === 'number') {
        draft.governancePolicy.retentionDays = body.retentionDays;
      }
    });

    const state = dbStore.getState();
    dbStore.appendAuditEvent({
      workspaceMode: WorkspaceMode.PRODUCTION,
      projectId: null,
      eventType: 'POLICY_CHANGE',
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      targetEntityType: 'GovernancePolicy',
      targetEntityId: 'global-policy',
      summary: `조직 데이터 처리 정책 변경: 외부 AI 계약원문 전송 허용=${state.governancePolicy.allowExternalAiContractProcessing}, 보존연한=${state.governancePolicy.retentionDays}일`,
      beforeSnapshot: null,
      afterSnapshot: JSON.stringify(state.governancePolicy),
    });

    res.json({ governancePolicy: state.governancePolicy });
  });

  // 15. Demo Workspace Reset
  app.post('/api/demo/reset', (req: Request, res: Response) => {
    dbStore.resetDemoWorkspace();
    res.json({ ok: true, messageKo: '데모 워크스페이스 가상 픽스처가 초기 상태로 복원되었습니다.' });
  });

  // Mount Vite or Static Dist
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`공공공사 법령 시점검토 server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
