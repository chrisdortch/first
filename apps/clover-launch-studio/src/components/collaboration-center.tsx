"use client";

import { useState } from "react";

const agreement = [
  ["Opportunity", "Synthetic community storytelling weekend"],
  ["Proposed participants", "Owner + two synthetic collaborators"],
  ["Stated goal", "Test a shared public-safe media concept"],
  ["Contributions", "Concept, venue research and synthetic design"],
  ["Ownership / IP", "Unallocated — agreement required"],
  ["Costs / revenue", "USD 0 prototype; no revenue commitment"],
  ["Decision rights", "Unanimous for publication or spend"],
  ["Visibility", "Proposal visible only in this synthetic preview"],
  ["Consent / attribution", "Explicit and revocable before publication"],
  ["Exit", "Any participant may withdraw before signature"],
  ["Dispute path", "Pause, preserve evidence, independent review"],
  ["Predicted fruit", "A clearer win-win-plus decision with burdens visible"],
  ["Risks / burdens", "Time, attribution ambiguity, opportunity cost"],
  ["Agreement", "Draft only · signature required"]
] as const;

export function CollaborationCenter() {
  const [state, setState] = useState<"draft" | "not-now" | "declined">("draft");
  return (
    <section className="prototype-card collaboration-card" aria-labelledby="collaboration-title">
      <div className="prototype-heading">
        <div><p className="card-kicker">Read-only synthetic proposal</p><h3 id="collaboration-title">Collaboration & JV Center</h3></div>
        <span className="safety-label">Signature required</span>
      </div>
      <dl className="agreement-grid">
        {agreement.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}
      </dl>
      <div className="button-pair">
        <button className="secondary-button" type="button" onClick={() => setState("draft")}>Keep draft</button>
        <button className="secondary-button" type="button" onClick={() => setState("not-now")}>Not now</button>
        <button className="danger-button" type="button" onClick={() => setState("declined")}>Decline</button>
      </div>
      <p className="inline-state" role="status" aria-live="polite">
        {state === "draft" ? "Draft retained in local preview state; no agreement exists." : state === "not-now" ? "Synthetic opportunity paused; nothing was sent." : "Synthetic opportunity declined; nothing was signed or published."}
      </p>
    </section>
  );
}
