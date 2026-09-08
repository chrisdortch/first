import branchRecordSet from "../../../../portfolio/core/tree-program/versions/0.1.0/records/branch-records.json";
import captainRecordSet from "../../../../portfolio/core/tree-program/versions/0.1.0/records/captains-log-owner-event-references.json";
import forecastRecordSet from "../../../../portfolio/core/tree-program/versions/0.1.0/records/fruit-forecasts.json";
import observationRecordSet from "../../../../portfolio/core/tree-program/versions/0.1.0/records/fruit-observations.json";
import packetRecordSet from "../../../../portfolio/core/tree-program/versions/0.1.0/records/model-launch-packets.json";
import actionRecordSet from "../../../../portfolio/core/tree-program/versions/0.1.0/records/owner-action-cards.json";
import milestoneRecordSet from "../../../../portfolio/core/tree-program/versions/0.1.0/records/program-milestones.json";
import progressRecordSet from "../../../../portfolio/core/tree-program/versions/0.1.0/records/program-progress-events.json";
import statusRecordSet from "../../../../portfolio/core/tree-program/versions/0.1.0/records/program-status-snapshot.json";
import providerRecordSet from "../../../../portfolio/core/tree-program/versions/0.1.0/records/provider-degraded-status.json";
import coverageRecordSet from "../../../../portfolio/core/tree-program/versions/0.1.0/records/source-coverage.json";
import relationshipRecordSet from "../../../../portfolio/core/tree-program/versions/0.1.0/records/tree-branch-relationships.json";
import planRecordSet from "../../../../portfolio/core/tree-program/versions/0.1.0/records/tree-master-plan.json";
import deltaRecordSet from "../../../../portfolio/core/tree-program/versions/0.1.0/records/understanding-delta-references.json";
import indexDocument from "../../../../portfolio/core/tree-program/index.json";

export type TreeStatus = "live" | "current" | "candidate" | "historical" | "blocked" | "provider-degraded" | "unknown" | "proposed" | "complete" | "hold";
export type SourceFreshness = "current" | "stale" | "unavailable" | "unknown";

export type SourceRef = {
  sourceId: string;
  identity: string;
  observedAt: string;
  freshness: SourceFreshness;
  required: boolean;
};

export type TreeDetail = { key: string; value: string };

export type TreeRecord = {
  recordId: string;
  title: string;
  summary: string;
  status: TreeStatus;
  sourceRefs: SourceRef[];
  details: TreeDetail[];
};

export type TreeBranch = {
  branchId: string;
  title: string;
  family: "root" | "trunk" | "bark" | "ring" | "branch" | "canopy" | "fruit" | "pod" | "collaboration";
  canonicalHome: string;
  owner: string;
  authorizedRoles: string[];
  purpose: string;
  sources: SourceRef[];
  liveIdentity: string;
  candidateIdentity: string;
  deployment: string;
  rollback: string;
  backupRestore: string;
  dataClassification: "public-sanitized" | "synthetic-only" | "private-excluded" | "unknown";
  allowedCoreProjection: string;
  connectorScope: string[];
  currentHealth: TreeStatus;
  sourceFreshness: SourceFreshness;
  trajectory: "advancing" | "steady" | "held" | "declining" | "unknown";
  dependencies: string[];
  collaborators: string[];
  nextGate: string;
  predictedFruit: string;
  observedFruit: string;
  unknowns: string[];
};

export type TreeRelationship = {
  relationshipId: string;
  fromBranchId: string;
  toBranchId: string;
  relationshipType: string;
  direction: "directed";
  summary: string;
  status: TreeStatus;
};

type RecordSet<T> = { observedAt: string; records: T[]; selfHash: string };
const records = <T>(recordSet: unknown) => (recordSet as RecordSet<T>).records;

export type TreeProgramSnapshot = {
  index: {
    indexId: string;
    indexHash: string;
    observedAt: string;
    publicSanitized: true;
    privateDataAccessed: false;
  };
  branches: TreeBranch[];
  relationships: TreeRelationship[];
  masterPlan: TreeRecord[];
  milestones: TreeRecord[];
  progress: TreeRecord[];
  sourceCoverage: TreeRecord[];
  status: TreeRecord[];
  captainLog: TreeRecord[];
  fruitForecasts: TreeRecord[];
  fruitObservations: TreeRecord[];
  understandingDeltas: TreeRecord[];
  actionCards: TreeRecord[];
  modelPackets: TreeRecord[];
  providerStatus: TreeRecord[];
};

export function getTreeProgramSnapshot(): TreeProgramSnapshot {
  const index = indexDocument as {
    indexId: string;
    indexHash: string;
    createdAt: string;
    publicSanitized: true;
    privateDataAccessed: false;
  };
  return {
    index: {
      indexId: index.indexId,
      indexHash: index.indexHash,
      observedAt: index.createdAt,
      publicSanitized: index.publicSanitized,
      privateDataAccessed: index.privateDataAccessed
    },
    branches: records<TreeBranch>(branchRecordSet),
    relationships: records<TreeRelationship>(relationshipRecordSet),
    masterPlan: records<TreeRecord>(planRecordSet),
    milestones: records<TreeRecord>(milestoneRecordSet),
    progress: records<TreeRecord>(progressRecordSet),
    sourceCoverage: records<TreeRecord>(coverageRecordSet),
    status: records<TreeRecord>(statusRecordSet),
    captainLog: records<TreeRecord>(captainRecordSet),
    fruitForecasts: records<TreeRecord>(forecastRecordSet),
    fruitObservations: records<TreeRecord>(observationRecordSet),
    understandingDeltas: records<TreeRecord>(deltaRecordSet),
    actionCards: records<TreeRecord>(actionRecordSet),
    modelPackets: records<TreeRecord>(packetRecordSet),
    providerStatus: records<TreeRecord>(providerRecordSet)
  };
}
