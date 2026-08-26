"use client";

import { useState, useTransition } from "react";
import { DecisionRail } from "./decision-rail";
import { PreviewPane } from "./preview-pane";
import { ProgressTimeline, type ProgressEvidence } from "./progress-timeline";
import { TranscriptEditor } from "./transcript-editor";

type LaunchStudioShellProps = {
  sourceLabel: string;
  freshnessLabel: string;
  initialProgress: ProgressEvidence[];
};

export function LaunchStudioShell({ sourceLabel, freshnessLabel, initialProgress }: LaunchStudioShellProps) {
  const [transcript, setTranscript] = useState("");
  const [message, setMessage] = useState("No private session has been created.");
  const [isPending, startTransition] = useTransition();

  function prepareSession() {
    startTransition(() => {
      void fetch("/api/sessions", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-Idempotency-Key": `owner-session:${crypto.randomUUID()}`,
          "X-Clover-CSRF": document.documentElement.dataset.csrf ?? "unavailable"
        },
        body: JSON.stringify({ operation: "create", reviewedText: transcript })
      }).then(async (response) => {
        if (!response.ok) {
          setMessage("HOLD — a verified owner session and exact CSRF binding are required.");
          return;
        }
        const result = await response.json() as { sessionId?: string };
        setMessage(result.sessionId ? "Session source created; no later decision was implied." : "HOLD — response identity unavailable.");
      }).catch(() => setMessage("HOLD — the private source endpoint is unavailable."));
    });
  }

  return (
    <div className="studio-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">Clover · Private owner workspace</p>
          <h1>Turn intent into evidence.</h1>
          <p className="lede">A calm, source-bound Launch Session that keeps understanding, impact, charter, preview, merge, and production decisions unmistakably separate.</p>
        </div>
        <div className="source-chip" aria-label="Source identity">
          <span>Source</span><strong>{sourceLabel}</strong>
          <span>Freshness</span><strong>{freshnessLabel}</strong>
        </div>
      </header>

      <ul className="status-strip" aria-label="Current truth">
        <li className="status-pill current">Current: source only</li>
        <li className="status-pill">Proposed: owner session</li>
        <li className="status-pill hold">HOLD: validation and preview</li>
      </ul>

      <div className="studio-grid">
        <div className="stack">
          <section className="panel" aria-labelledby="transcript-title">
            <div className="panel-header"><div><h2 id="transcript-title">Reviewed owner event</h2><p>Exact text becomes immutable only after authenticated submission.</p></div></div>
            <div className="panel-body">
              <TranscriptEditor value={transcript} onChange={setTranscript} disabled={isPending} />
              <div className="action-row">
                <span className="inline-state" role="status" aria-live="polite">{message}</span>
                <button className="primary-button" type="button" disabled={isPending || transcript.length === 0} onClick={prepareSession}>
                  {isPending ? "Preparing…" : "Begin owner session"}
                </button>
              </div>
            </div>
          </section>

          <section className="panel" aria-labelledby="progress-title">
            <div className="panel-header"><div><h2 id="progress-title">Evidence timeline</h2><p>Material state only—never hidden reasoning.</p></div></div>
            <div className="panel-body"><ProgressTimeline items={initialProgress} /></div>
          </section>
        </div>

        <aside className="stack" aria-label="Decision and preview controls">
          <section className="panel" aria-labelledby="decisions-title">
            <div className="panel-header"><div><h2 id="decisions-title">Decision rails</h2><p>No rail inherits another rail’s authority.</p></div></div>
            <div className="panel-body rails">
              <DecisionRail title="Charter approval" description="Requires an exact reviewed Charter." state="pending" />
              <DecisionRail title="Preview acceptance" description="Requires a separately created preview." state="unavailable" />
              <DecisionRail title="Merge approval" description="Requires exact source and validation evidence." state="unavailable" />
              <DecisionRail title="Production approval" description="Requires an independent production gate." state="hold" />
            </div>
          </section>

          <section className="panel" aria-labelledby="preview-title">
            <div className="panel-header"><div><h2 id="preview-title">Preview</h2><p>Current and proposed state remain distinct.</p></div></div>
            <div className="panel-body"><PreviewPane /></div>
          </section>

          <section className="panel" aria-labelledby="truth-title">
            <div className="panel-header"><div><h2 id="truth-title">Boundary truth</h2><p>Provider-neutral and fail-closed.</p></div></div>
            <div className="panel-body truth-grid">
              <div className="truth-card"><span>Authentication</span><strong>Unconfigured</strong></div>
              <div className="truth-card"><span>Storage</span><strong>Synthetic only</strong></div>
              <div className="truth-card"><span>Native voice</span><strong>False</strong></div>
              <div className="truth-card"><span>Production</span><strong>Not authorized</strong></div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
