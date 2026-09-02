import type {
  EvidenceVerificationApplicationApi,
  EvidenceCommandApi,
  EvidenceQueryApi,
} from "@adeptify/goalboard-contracts/modules/evidence-verification";

import { EvidenceLifecycle, type EvidenceLifecycleOptions } from "./lifecycle.js";
import { EvidenceRepository, type EvidenceSqliteDatabase } from "./repository.js";
import { EvidenceVerificationService } from "./verification.js";

export const packageDescriptor = {
  packageName: "@adeptify/goalboard-module-evidence-verification",
  packagePath: "modules/evidence-verification",
  kind: "module",
  maturity: "partial",
  contract: "@adeptify/goalboard-contracts/modules/evidence-verification",
  migrationGoals: ["goal-reorg-f2", "goal-reorg-ex2", "goal-reorg-ex4"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [
    "evidence.records.v1",
    "evidence.corrections.v1",
    "evidence.locator-preflight.v1",
    "evidence.verification-gates.v1",
  ],
} as const;

export type GoalBoardPackageDescriptor = typeof packageDescriptor;

export interface EvidenceVerificationModuleOptions extends EvidenceLifecycleOptions {
  db: EvidenceSqliteDatabase;
}

export class EvidenceVerificationModule implements EvidenceVerificationApplicationApi {
  readonly repository: EvidenceRepository;
  readonly lifecycle: EvidenceLifecycle;
  readonly verification: EvidenceVerificationService;
  readonly query: EvidenceQueryApi;
  readonly commands: EvidenceCommandApi;

  constructor(options: EvidenceVerificationModuleOptions) {
    this.repository = new EvidenceRepository(options.db);
    this.lifecycle = new EvidenceLifecycle(this.repository, options);
    this.verification = new EvidenceVerificationService(this.repository);
    this.query = this.verification;
    this.commands = this.lifecycle;
  }
}

export {
  EvidenceVerificationError,
  type EvidenceVerificationErrorFactory,
} from "./errors.js";
export { criterionHasPassingResult, currentEffectiveEvidence } from "./coverage.js";
export { EvidenceLifecycle, type EvidenceLifecycleOptions } from "./lifecycle.js";
export {
  MAX_PROJECT_REFERENCE_BYTES,
  ProjectReferenceError,
  projectReferenceSegments,
  readProjectReference,
  validateEvidenceLocator,
  type EvidenceLocatorValidation,
} from "./locator.js";
export {
  evidenceCorrectionsMigrationRequired,
  migrateEvidenceContractRevisionColumns,
  migrateEvidenceCorrections,
  migrateEvidenceLocatorSource,
  migrateEvidenceLocatorValidation,
  migrateEvidenceLocatorWorkspace,
  type EvidenceMigrationDatabase,
} from "./migrations.js";
export {
  EVIDENCE_SCHEMA_SQL,
  EvidenceRepository,
  createEvidenceSchema,
  mapEvidence,
  mapEvidenceCorrection,
  type EvidenceEventInput,
  type EvidenceSqliteDatabase,
  type EvidenceSqliteStatement,
} from "./repository.js";
export { EvidenceVerificationService } from "./verification.js";
