"use client";

import { useEffect, useMemo, useState } from "react";
import { ActionPacketPanel } from "./action-packet-panel";
import { CollaborationCenter } from "./collaboration-center";
import { DecisionRail } from "./decision-rail";
import { OwnerInputPanel } from "./owner-input-panel";
import { PersonalLaunchPod } from "./personal-launch-pod";
import { PreviewPane } from "./preview-pane";
import { ProgressTimeline } from "./progress-timeline";
import { TranscriptEditor } from "./transcript-editor";
import { TreeMap } from "./tree-map";
import { baselineObservationTime, reconcileTreeTruth, type CurrentActionCard, type DeploymentSelfObservation, type GitHubLiveObservation, type TruthReadiness } from "@/lib/live-truth";
import { compareDeploymentAttestation, parseBuildProvenance, type AttestationComparison } from "@/lib/provenance";
import type { TreeBranch, TreeProgramSnapshot, TreeRecord, TreeStatus } from "@/lib/tree-program";

const views = [
  "Today",
  "Tree",
  "Master Plan",
  "Branches",
  "Roots and Source Coverage",
  "Captain's Log",
  "Fruit Ledger",
  "Collaboration and JV Center",
  "Action Center",
  "System Health",
  "Launch Studio session"
] as const;
type View = (typeof views)[number];

const heldReadiness: TruthReadiness = {
  applicationSourceValidated: true,
  treeProgramBaselineLoaded: true,
  treePreviewRuntimeObserved: false,
  liveGithubOverlayStatus: "unavailable",
  deploymentAttestationStatus: "unavailable",
  ownerConsoleGroundingRequired: true,
  privateOwnerAuthenticationConfigured: false,
  durablePrivateStorageConfigured: false,
  realParticipantRuntimeConfigured: false,
  realProviderExecutionConfigured: false,
  productionAuthorized: false
};

const unavailableDeployment: DeploymentSelfObservation = {
  sourceId: "vercel-deployment-self",
  sourceIdentity: "vercel-system-environment",
  evidenceClass: "deployment-self-observation",
  status: "unavailable",
  freshness: "unavailable",
  observedAt: null,
  errorCode: "deployment-self-unavailable",
  environment: null,
  hostname: null,
  projectId: null,
  deploymentId: null,
  region: null,
  gitCommitSha: null,
  failures: ["deployment-self-unavailable"],
  environmentKeysRead: []
};

const heldAction: CurrentActionCard = {
  action: "HOLD",
  status: "hold",
  reason: "source-refresh-required",
  source: "runtime-live-truth-reconciliation",
  observedAt: null,
  bindings: { protectedMain: null, pull34: null, pull35: null, deployment: unavailableDeployment, sourceFreshness: "unavailable", githubObservedAt: null, deploymentObservedAt: null, contradictions: ["live-readback-loading"] },
  requiredOwnerDecision: "HOLD",
  authority: { mergeAuthorized: false, productionAuthorized: false, privateDataAuthorized: false, externalMessagingAuthorized: false, paymentAuthorized: false, purchaseAuthorized: false },
  rollback: "retain-draft-prs-and-delete-target-null-preview-in-separate-authorized-gate"
};

type LiveTruthState = {
  phase: "loading" | "observed" | "unavailable";
  action: CurrentActionCard;
  readiness: TruthReadiness;
  github: GitHubLiveObservation | null;
  deployment: DeploymentSelfObservation | null;
  attestation: AttestationComparison | null;
  requestObservedAt: string | null;
  contradictions: string[];
  error: string | null;
};

const initialLiveTruth: LiveTruthState = {
  phase: "loading",
  action: heldAction,
  readiness: heldReadiness,
  github: null,
  deployment: null,
  attestation: null,
  requestObservedAt: null,
  contradictions: ["live-readback-loading"],
  error: null
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asLiveReadback(value: unknown, snapshot: TreeProgramSnapshot) {
  if (!isRecord(value) || !isRecord(value.baseline) || !isRecord(value.observations) || !isRecord(value.reconciled) || !isRecord(value.authority)) {
    throw new Error("live-readback-structure");
  }
  if (value.baseline.indexId !== snapshot.index.indexId || value.baseline.indexHash !== snapshot.index.indexHash || value.baseline.classification !== "historical-source-bound-baseline" || !isRecord(value.baseline.immutableRecords)) {
    throw new Error("live-readback-baseline-substitution");
  }
  if (value.authority.mergeAuthorized !== false || value.authority.productionAuthorized !== false || value.authority.privateDataAuthorized !== false || value.authority.purchaseAuthorized !== false) {
    throw new Error("live-readback-authority-widening");
  }
  if (!isRecord(value.observations.github) || !isRecord(value.observations.deploymentSelf) || !isRecord(value.observations.clover) || typeof value.requestObservedAt !== "string") {
    throw new Error("live-readback-observation-structure");
  }
  if (value.observations.clover.status !== "external-owner-console-required" || value.observations.clover.webRuntimeConnectorInvoked !== false) throw new Error("clover-observation-substitution");
  return {
    github: value.observations.github as GitHubLiveObservation,
    deployment: value.observations.deploymentSelf as DeploymentSelfObservation,
    requestObservedAt: value.requestObservedAt
  };
}

const statusLabel = (status: TreeStatus) => status.replace("provider-degraded", "provider degraded");
function StatusBadge({ status }: { status: TreeStatus }) {
  return <span className="status-badge" data-status={status}><span aria-hidden="true" />{statusLabel(status)}</span>;
}

function RecordCards({ records, empty = "No current canonical record." }: { records: TreeRecord[]; empty?: string }) {
  if (records.length === 0) return <p className="empty-state">{empty}</p>;
  return (
    <div className="record-grid">
      {records.map((record) => (
        <article className="record-card" key={record.recordId}>
          <div className="record-heading"><h3>{record.title}</h3><StatusBadge status={record.status} /></div>
          <p>{record.summary}</p>
          <dl>
            {record.details.map((item) => <div key={item.key}><dt>{item.key.replace(/([A-Z])/gu, " $1")}</dt><dd>{item.value}</dd></div>)}
          </dl>
          <p className="source-footnote">{record.sourceRefs.length} source anchor{record.sourceRefs.length === 1 ? "" : "s"} · {record.sourceRefs.some(({ freshness }) => freshness !== "current") ? "freshness qualified" : "current at observation"}</p>
        </article>
      ))}
    </div>
  );
}

function BranchTable({ branches }: { branches: TreeBranch[] }) {
  return (
    <div className="branch-table-wrap">
      <table className="branch-table">
        <caption>Canonical public-sanitized branch readback</caption>
        <thead><tr><th>Branch</th><th>Home</th><th>Health</th><th>Trajectory</th><th>Freshness</th><th>Next gate</th></tr></thead>
        <tbody>
          {branches.map((branch) => (
            <tr key={branch.branchId}>
              <th scope="row"><strong>{branch.title}</strong><span>{branch.family}</span></th>
              <td><code>{branch.canonicalHome}</code></td>
              <td><StatusBadge status={branch.currentHealth} /></td>
              <td>{branch.trajectory}</td>
              <td>{branch.sourceFreshness}</td>
              <td>{branch.nextGate}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LaunchSessionView() {
  const [transcript, setTranscript] = useState("");
  const progress = [
    { id: "source", label: "Source candidate", state: "current" as const, detail: "Original Action 006 identity and Stack B integration identity remain separate." },
    { id: "understanding", label: "Understanding Check", state: "proposed" as const, detail: "Synthetic owner input is editable and hash-visible." },
    { id: "context", label: "Context Pack", state: "proposed" as const, detail: "Public-sanitized Tree Program records only." },
    { id: "impact", label: "Impact Scan", state: "hold" as const, detail: "Merge, production, private data and spending remain outside this campaign." },
    { id: "preview", label: "Target-null preview", state: "proposed" as const, detail: "One preview only after exact source and browser gates." }
  ];
  return (
    <div className="session-grid">
      <section className="command-panel"><div className="section-heading"><div><p className="card-kicker">Launch Studio session</p><h2>Exact reviewed transcript</h2></div><span className="safety-label">Synthetic persistence</span></div><TranscriptEditor value={transcript} onChange={setTranscript} /></section>
      <section className="command-panel"><div className="section-heading"><div><p className="card-kicker">Evidence timeline</p><h2>Separate gates stay separate</h2></div></div><ProgressTimeline items={progress} /></section>
      <section className="command-panel"><div className="section-heading"><div><p className="card-kicker">Decision rails</p><h2>Authority never inherits</h2></div></div><div className="rails"><DecisionRail title="Preview acceptance" description="Requires exact browser evidence." state="pending" /><DecisionRail title="Merge approval" description="Not authorized in this campaign." state="unavailable" /><DecisionRail title="Production approval" description="Independently reviewed gate required." state="hold" /></div></section>
      <section className="command-panel"><div className="section-heading"><div><p className="card-kicker">Preview boundary</p><h2>Target null only</h2></div></div><PreviewPane /></section>
    </div>
  );
}

export function TreeCommandCenter({ snapshot }: { snapshot: TreeProgramSnapshot }) {
  const [activeView, setActiveView] = useState<View>("Today");
  const [liveTruth, setLiveTruth] = useState<LiveTruthState>(initialLiveTruth);
  const heldBranches = useMemo(() => snapshot.branches.filter(({ currentHealth }) => currentHealth === "hold" || currentHealth === "blocked"), [snapshot.branches]);
  const advancingBranches = useMemo(() => snapshot.branches.filter(({ trajectory }) => trajectory === "advancing"), [snapshot.branches]);
  const immutableBaselineObservedAt = baselineObservationTime(snapshot);
  const immutableBaselineLabel = `immutable baseline / observed ${immutableBaselineObservedAt.replace(".000Z", "Z")}`;

  useEffect(() => {
    let active = true;
    async function loadLiveTruth() {
      try {
        const requestOptions = { cache: "no-store" as const, credentials: "same-origin" as const, headers: { Accept: "application/json" } };
        const [treeResponse, provenanceResponse] = await Promise.all([
          fetch("/api/tree", requestOptions),
          fetch("/api/provenance", requestOptions)
        ]);
        if (!treeResponse.ok || !provenanceResponse.ok) throw new Error("live-readback-unavailable");
        const readback = asLiveReadback(await treeResponse.json(), snapshot);
        const provenancePayload: unknown = await provenanceResponse.json();
        if (!isRecord(provenancePayload) || !isRecord(provenancePayload.provenance) || !isRecord(provenancePayload.authority)) throw new Error("provenance-readback-structure");
        if (provenancePayload.authority.mergeAuthorized !== false || provenancePayload.authority.productionAuthorized !== false || provenancePayload.authority.privateDataAuthorized !== false || provenancePayload.authority.purchaseAuthorized !== false) throw new Error("provenance-authority-widening");
        const build = parseBuildProvenance(provenancePayload.provenance);

        let attestationCandidate: unknown = null;
        try {
          const attestationResponse = await fetch("/__clover/deployment-attestation.json", requestOptions);
          if (attestationResponse.ok) attestationCandidate = await attestationResponse.json();
        } catch {
          attestationCandidate = null;
        }
        const attestation = await compareDeploymentAttestation(build, attestationCandidate);
        const reconciliation = reconcileTreeTruth({ baseline: snapshot, build, github: readback.github, deployment: readback.deployment, attestation });
        if (active) {
          setLiveTruth({
            phase: "observed",
            action: reconciliation.currentActionCard,
            readiness: reconciliation.readiness,
            github: readback.github,
            deployment: readback.deployment,
            attestation,
            requestObservedAt: readback.requestObservedAt,
            contradictions: reconciliation.contradictions.value,
            error: null
          });
        }
      } catch (error) {
        if (active) setLiveTruth({ ...initialLiveTruth, phase: "unavailable", error: error instanceof Error ? error.message : "live-readback-unavailable" });
      }
    }
    void loadLiveTruth();
    return () => { active = false; };
  }, [snapshot]);

  let content;
  if (activeView === "Today") {
    content = (
      <div className="dashboard-grid">
        <section className="command-panel hero-panel">
          <p className="card-kicker">Today · one owner decision</p>
          <h2>{liveTruth.action.action}</h2><p>{liveTruth.action.reason}</p>
          <div className="hero-actions"><button type="button" onClick={() => setActiveView("Action Center")}>Open Action Center</button><button className="secondary-button" type="button" onClick={() => setActiveView("Tree")}>See the whole Tree</button></div>
          <p className="authority-note">This current Action Card grants no merge, production, private-data, messaging, payment, purchase or spending authority.</p>
          <dl className="observation-grid today-observations"><div><dt>Immutable baseline</dt><dd>{immutableBaselineLabel}</dd></div><div><dt>Current-source time</dt><dd>{liveTruth.github?.observedAt ?? "unavailable"}</dd></div><div><dt>Request time</dt><dd>{liveTruth.requestObservedAt ?? "unavailable"}</dd></div><div><dt>Source freshness</dt><dd>{liveTruth.github?.freshness ?? "unavailable"}</dd></div><div><dt>Contradictions</dt><dd>{liveTruth.contradictions.length ? liveTruth.contradictions.join(", ") : "none"}</dd></div><div><dt>Owner Console / Clover</dt><dd>external refresh required</dd></div></dl>
        </section>
        <section className="command-panel pulse-panel">
          <div className="section-heading"><div><p className="card-kicker">Tree pulse</p><h2>Source-bound, not scored</h2></div></div>
          <div className="pulse-grid"><div><strong>{snapshot.branches.length}</strong><span>branches represented</span></div><div><strong>{advancingBranches.length}</strong><span>advancing</span></div><div><strong>{heldBranches.length}</strong><span>held / blocked</span></div><div><strong>{snapshot.relationships.length}</strong><span>typed relationships</span></div></div>
        </section>
        <section className="command-panel span-two"><div className="section-heading"><div><p className="card-kicker">{immutableBaselineLabel}</p><h2>Dated historical milestone evidence</h2></div></div><RecordCards records={snapshot.milestones} /></section>
      </div>
    );
  } else if (activeView === "Tree") {
    content = <section className="command-panel full-bleed-panel"><div className="section-heading"><div><p className="card-kicker">Program graph</p><h2>The Clover Tree</h2><p>Roots feed the trunk; bark protects it; branches carry governed work; fruit separates forecasts from observations.</p></div></div><TreeMap branches={snapshot.branches} relationships={snapshot.relationships} /></section>;
  } else if (activeView === "Master Plan") {
    content = <section className="command-panel"><div className="section-heading"><div><p className="card-kicker">Master Plan</p><h2>Converge without collapsing boundaries</h2></div></div><RecordCards records={snapshot.masterPlan} /></section>;
  } else if (activeView === "Branches") {
    content = <section className="command-panel full-bleed-panel"><div className="section-heading"><div><p className="card-kicker">Branches</p><h2>Exact homes, health and next gates</h2></div></div><BranchTable branches={snapshot.branches} /></section>;
  } else if (activeView === "Roots and Source Coverage") {
    const roots = snapshot.branches.filter(({ family }) => family === "root" || family === "trunk");
    content = <div className="dashboard-grid"><section className="command-panel"><div className="section-heading"><div><p className="card-kicker">Roots</p><h2>What the Tree can know</h2></div></div>{roots.map((branch) => <article className="root-card" key={branch.branchId}><h3>{branch.title}</h3><p>{branch.purpose}</p><StatusBadge status={branch.currentHealth} /></article>)}</section><section className="command-panel span-two"><div className="section-heading"><div><p className="card-kicker">Source coverage</p><h2>Unavailable never becomes complete</h2></div></div><RecordCards records={snapshot.sourceCoverage} /></section></div>;
  } else if (activeView === "Captain's Log") {
    content = <section className="command-panel"><div className="section-heading"><div><p className="card-kicker">Captain&apos;s Log</p><h2>Append-only owner observation references</h2><p>Public references only; raw private text stays out of Core.</p></div></div><RecordCards records={[...snapshot.captainLog, ...snapshot.progress]} /></section>;
  } else if (activeView === "Fruit Ledger") {
    content = <div className="fruit-columns"><section className="command-panel forecast-panel"><div className="section-heading"><div><p className="card-kicker">Predicted fruit</p><h2>Forecasts</h2></div></div><RecordCards records={snapshot.fruitForecasts} /></section><section className="command-panel observation-panel"><div className="section-heading"><div><p className="card-kicker">Observed fruit</p><h2>Actual readback</h2></div></div><RecordCards records={snapshot.fruitObservations} /></section></div>;
  } else if (activeView === "Collaboration and JV Center") {
    content = <div className="prototype-grid"><CollaborationCenter /><PersonalLaunchPod /></div>;
  } else if (activeView === "Action Center") {
    content = <div className="action-center"><OwnerInputPanel branches={snapshot.branches} /><section className="command-panel"><div className="section-heading"><div><p className="card-kicker">All supported targets</p><h2>Launch packets, never hidden authority</h2></div></div><ActionPacketPanel /></section></div>;
  } else if (activeView === "System Health") {
    content = <div className="dashboard-grid"><section className="command-panel span-two live-truth-panel"><div className="section-heading"><div><p className="card-kicker">Reconciled current status</p><h2>Readiness stays multidimensional</h2><p>Request time is displayed separately and never upgrades source freshness.</p></div><StatusBadge status={liveTruth.action.status === "available" ? "current" : "hold"} /></div><div className="readiness-grid">{Object.entries(liveTruth.readiness).map(([key, value]) => { const ready = value === true || value === "current" || value === "verified" || (value === false && ["privateOwnerAuthenticationConfigured", "durablePrivateStorageConfigured", "realParticipantRuntimeConfigured", "realProviderExecutionConfigured", "productionAuthorized"].includes(key)); return <div key={key}><span>{key.replace(/([A-Z])/gu, " $1")}</span><strong data-readiness={ready ? "ready" : "hold"}>{String(value)}</strong></div>; })}</div><dl className="observation-grid"><div><dt>Immutable baseline</dt><dd>{immutableBaselineLabel}</dd></div><div><dt>GitHub source time</dt><dd>{liveTruth.github?.observedAt ?? "unavailable"}</dd></div><div><dt>Source freshness</dt><dd>{liveTruth.github?.freshness ?? "unavailable"}</dd></div><div><dt>Deployment self</dt><dd>{liveTruth.deployment?.status ?? "unavailable"} / {liveTruth.deployment?.freshness ?? "unavailable"}</dd></div><div><dt>Output attestation</dt><dd>{liveTruth.attestation?.status ?? "unavailable"}</dd></div><div><dt>Request observed</dt><dd>{liveTruth.requestObservedAt ?? "unavailable"}</dd></div><div><dt>Contradictions</dt><dd>{liveTruth.contradictions.length ? liveTruth.contradictions.join(", ") : "none"}</dd></div><div><dt>Owner Console / Clover</dt><dd>external-owner-console-required · no Clover connector was invoked by the web runtime</dd></div><div><dt>Readback phase</dt><dd>{liveTruth.phase}{liveTruth.error ? ` · ${liveTruth.error}` : ""}</dd></div></dl></section><section className="command-panel"><div className="section-heading"><div><p className="card-kicker">{immutableBaselineLabel}</p><h2>Historical canonical status</h2></div></div><RecordCards records={snapshot.status} /></section><section className="command-panel span-two"><div className="section-heading"><div><p className="card-kicker">Provider evidence</p><h2>Degraded is not failed</h2></div></div><RecordCards records={snapshot.providerStatus} /></section></div>;
  } else {
    content = <LaunchSessionView />;
  }

  return (
    <div className="tree-command-center">
      <aside className="command-sidebar">
        <div className="tree-mark" aria-label="Clover Tree"><span className="tree-mark-leaf">⌁</span><div><strong>Clover</strong><span>Tree Command Center</span></div></div>
        <nav aria-label="Command Center views"><ul>{views.map((view) => <li key={view}><button type="button" aria-current={activeView === view ? "page" : undefined} onClick={() => setActiveView(view)}><span aria-hidden="true">{String(views.indexOf(view) + 1).padStart(2, "0")}</span>{view}</button></li>)}</ul></nav>
        <div className="sidebar-boundary"><span className="status-dot" />Preview 0.1<p>Public-sanitized synthetic data. Target null. No production authority.</p></div>
      </aside>
      <main className="command-main" id="main-content">
        <header className="command-header">
          <div><p className="eyebrow">Owner command center · preview-only candidate</p><h1>{activeView}</h1></div>
          <div className="source-readback" aria-label="Source readback">
            <div><span>Canonical source</span><strong>{snapshot.index.indexId}</strong></div>
            <div><span>Immutable baseline</span><strong>{immutableBaselineLabel}</strong></div>
            <div><span>GitHub observed</span><strong>{liveTruth.github?.observedAt ?? "unavailable"}</strong></div>
            <div><span>Deployment self</span><strong>{liveTruth.deployment?.status ?? "unavailable"}</strong></div>
          </div>
        </header>
        <div className="command-content">{content}</div>
        <footer className="command-footer"><span>Index {snapshot.index.indexHash.slice(0, 12)}…</span><span>Private data accessed: {String(snapshot.index.privateDataAccessed)}</span><span>Durable private storage: not claimed</span></footer>
      </main>
    </div>
  );
}
