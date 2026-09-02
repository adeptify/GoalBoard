import type {
  GovernanceApplicationApi,
  GovernanceQueryApi,
  GovernanceRecordsApi,
} from "@adeptify/goalboard-contracts/modules/governance-collaboration";

import {
  GovernanceRepository,
  type GovernanceSqliteDatabase,
} from "./repository.js";
import {
  GovernanceReviewLifecycle,
  type GovernanceReviewLifecycleOptions,
} from "./review-lifecycle.js";
import { GovernanceRecordStore } from "./record-store.js";

export const packageDescriptor = {
  packageName: "@adeptify/goalboard-module-governance-collaboration",
  packagePath: "modules/governance-collaboration",
  kind: "module",
  maturity: "partial",
  contract: "@adeptify/goalboard-contracts/modules/governance-collaboration",
  migrationGoals: ["goal-reorg-f2","goal-reorg-ex3","goal-reorg-ex4"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [
    "governance.review-obligations.v1",
    "governance.reviews.v1",
    "governance.proposals.v1",
    "governance.decisions.v1",
  ],
} as const;

export type GoalBoardPackageDescriptor = typeof packageDescriptor;

export interface GovernanceCollaborationModuleOptions extends GovernanceReviewLifecycleOptions {
  db: GovernanceSqliteDatabase;
}

export class GovernanceCollaborationModule implements GovernanceApplicationApi {
  readonly repository: GovernanceRepository;
  readonly reviews: GovernanceReviewLifecycle;
  readonly records: GovernanceRecordsApi;
  readonly decisions: GovernanceApplicationApi["decisions"];
  readonly query: GovernanceQueryApi;

  constructor(options: GovernanceCollaborationModuleOptions) {
    this.repository = new GovernanceRepository(options.db);
    this.reviews = new GovernanceReviewLifecycle(this.repository, options);
    this.records = new GovernanceRecordStore(options.db);
    this.decisions = {
      materializeAtomically: (operation) => this.repository.immediate(operation),
    };
    this.query = {
      snapshot: (boardId) => this.repository.snapshot(boardId),
      getReviewObligation: (boardId, obligationId) =>
        this.repository.getReviewObligation(boardId, obligationId),
      listReviewObligations: (boardId, goalId) =>
        this.repository.listReviewObligations(boardId, goalId),
      listReviews: (boardId, goalId) => this.repository.listReviews(boardId, goalId),
      getCandidate: (boardId, candidateId) => this.repository.getCandidate(boardId, candidateId),
      getContractProposal: (boardId, proposalId) =>
        this.repository.getContractProposal(boardId, proposalId),
      getRewire: (boardId, rewireId) => this.repository.getRewire(boardId, rewireId),
      getGoalTreeProposal: (boardId, proposalId) =>
        this.repository.getGoalTreeProposal(boardId, proposalId),
      listGoalTreeProposals: (boardId) => this.repository.listGoalTreeProposals(boardId),
      latestNeedsChangesReviewEventSeq: (boardId, goalId) =>
        this.repository.latestNeedsChangesReviewEventSeq(boardId, goalId),
    };
  }
}

export { GovernanceError, type GovernanceErrorFactory } from "./errors.js";
export {
  json as governanceJson,
  mapCandidate,
  mapContractProposal,
  mapGoalTreeProposal,
  mapGoalTreeProposalDecision,
  mapGoalTreeProposalItem,
  mapReview,
  mapReviewObligation,
  mapRewire,
  parseJson as parseGovernanceJson,
} from "./mappers.js";
export {
  GOVERNANCE_SCHEMA_SQL,
  createGovernanceSchema,
  type GovernanceSchemaDatabase,
} from "./schema.js";
export {
  GovernanceRepository,
  type GovernanceSqliteDatabase,
  type GovernanceSqliteStatement,
} from "./repository.js";
export {
  GovernanceReviewLifecycle,
  type GovernanceReviewLifecycleOptions,
} from "./review-lifecycle.js";
export {
  GovernanceRecordStore,
} from "./record-store.js";
export {
  governanceLegacySupersessionMigrationRequired,
  governanceNarrativeMigrationRequired,
  migrateContractProposals,
  migrateGoalTreeLegacySupersession,
  migrateGoalTreeProposalDecisions,
  migrateGoalTreeProposalNarrative,
  migrateGoalTreeProposals,
  migrateReviewContractRevisionColumn,
  migrateRuntimeDialogueAuthority,
} from "./migrations.js";
export { assertGovernanceTransition, deriveGoalTreeProposalState } from "./state-machine.js";
