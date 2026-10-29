import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ApplicabilityAssessment,
  ApplicabilityRule,
  AppUser,
  AuditEvent,
  Document,
  ExportRecord,
  Fact,
  GovernancePolicySettings,
  LegalInstrument,
  Project,
  ProjectEvent,
  ProvisionVersion,
  ReviewDecision,
  SourceRecord,
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
} from '../data/seedData.ts';

export interface PersistentDatabaseState {
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

const DEFAULT_DB_DIR = path.join(os.tmpdir(), 'public-construction-legal-review');
const DB_FILE_PATH = process.env.SQLITE_DB_PATH
  ? path.resolve(process.cwd(), process.env.SQLITE_DB_PATH)
  : path.join(DEFAULT_DB_DIR, 'public_construction_legal_review.db.json');
const DATA_DIR = path.dirname(DB_FILE_PATH);

function createInitialState(): PersistentDatabaseState {
  return {
    users: structuredClone(SEED_USERS),
    projects: structuredClone(SEED_PROJECTS),
    events: structuredClone(SEED_EVENTS),
    documents: structuredClone(SEED_DOCUMENTS),
    facts: structuredClone(SEED_FACTS),
    sourceRecords: structuredClone(SEED_SOURCE_RECORDS),
    instruments: structuredClone(SEED_INSTRUMENTS),
    provisionVersions: structuredClone(SEED_PROVISION_VERSIONS),
    rules: structuredClone(SEED_RULES),
    assessments: structuredClone(SEED_ASSESSMENTS),
    reviewDecisions: structuredClone(SEED_REVIEW_DECISIONS),
    auditEvents: structuredClone(SEED_AUDIT_EVENTS),
    exportRecords: structuredClone(SEED_EXPORT_RECORDS),
    governancePolicy: {
      allowExternalAiContractProcessing:
        process.env.ALLOW_EXTERNAL_AI_CONTRACT_PROCESSING === 'true',
      amendmentMonitoringMode:
        process.env.AMENDMENT_SCHEDULER_ENABLED === 'true' &&
        Boolean(process.env.AMENDMENT_SCHEDULER_CRON)
          ? 'SCHEDULED_SERVER_CRON'
          : 'MANUAL_ON_DEMAND',
      schedulerConfigured:
        process.env.AMENDMENT_SCHEDULER_ENABLED === 'true' &&
        Boolean(process.env.AMENDMENT_SCHEDULER_CRON),
      retentionDays: 1825, // 5년 보존 기본값
      privateStorageEnforced: true,
    },
    lastMolegRetrievalAt: null,
  };
}

class ServerPersistentStore {
  private state: PersistentDatabaseState;

  constructor() {
    this.state = this.loadFromDisk();
  }

  private loadFromDisk(): PersistentDatabaseState {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE_PATH)) {
        const raw = fs.readFileSync(DB_FILE_PATH, 'utf-8');
        const parsed = JSON.parse(raw) as PersistentDatabaseState;
        if (parsed && Array.isArray(parsed.projects) && Array.isArray(parsed.assessments)) {
          return parsed;
        }
      }
    } catch (err) {
      console.error('Failed to load persistent DB file, initializing seed state:', err);
    }
    const initial = createInitialState();
    this.saveToDisk(initial);
    return initial;
  }

  private saveToDisk(nextState: PersistentDatabaseState = this.state): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tmpPath = `${DB_FILE_PATH}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(nextState, null, 2), 'utf-8');
      fs.renameSync(tmpPath, DB_FILE_PATH);
    } catch (err) {
      console.error('Failed to persist state to disk:', err);
    }
  }

  public getState(): PersistentDatabaseState {
    return this.state;
  }

  public mutate(mutator: (draft: PersistentDatabaseState) => void): PersistentDatabaseState {
    mutator(this.state);
    this.saveToDisk(this.state);
    return this.state;
  }

  public appendAuditEvent(event: Omit<AuditEvent, 'id' | 'createdAt'>): AuditEvent {
    const nowKst =
      new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).replace(' ', 'T') + '+09:00';
    const record: AuditEvent = {
      ...event,
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: nowKst,
    };
    this.state.auditEvents.unshift(record);
    this.saveToDisk(this.state);
    return record;
  }

  public resetDemoWorkspace(): void {
    const initial = createInitialState();
    this.state.projects = [
      ...this.state.projects.filter((p) => p.workspaceMode !== 'DEMO'),
      ...initial.projects.filter((p) => p.workspaceMode === 'DEMO'),
    ];
    this.state.events = [
      ...this.state.events.filter((e) => e.workspaceMode !== 'DEMO'),
      ...initial.events.filter((e) => e.workspaceMode === 'DEMO'),
    ];
    this.state.documents = [
      ...this.state.documents.filter((d) => d.workspaceMode !== 'DEMO'),
      ...initial.documents.filter((d) => d.workspaceMode === 'DEMO'),
    ];
    this.state.facts = [
      ...this.state.facts.filter((f) => f.workspaceMode !== 'DEMO'),
      ...initial.facts.filter((f) => f.workspaceMode === 'DEMO'),
    ];
    this.state.sourceRecords = [
      ...this.state.sourceRecords.filter((s) => s.workspaceMode !== 'DEMO'),
      ...initial.sourceRecords.filter((s) => s.workspaceMode === 'DEMO'),
    ];
    this.state.provisionVersions = [
      ...this.state.provisionVersions.filter((pv) => pv.workspaceMode !== 'DEMO'),
      ...initial.provisionVersions.filter((pv) => pv.workspaceMode === 'DEMO'),
    ];
    this.state.rules = [
      ...this.state.rules.filter((r) => r.workspaceMode !== 'DEMO'),
      ...initial.rules.filter((r) => r.workspaceMode === 'DEMO'),
    ];
    this.state.assessments = [
      ...this.state.assessments.filter((a) => a.workspaceMode !== 'DEMO'),
      ...initial.assessments.filter((a) => a.workspaceMode === 'DEMO'),
    ];
    this.saveToDisk(this.state);
  }
}

export const dbStore = new ServerPersistentStore();
