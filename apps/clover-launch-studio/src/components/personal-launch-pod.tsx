"use client";

import { useState } from "react";

const stages = [
  ["Identity", "Synthetic participant · Avery Example"],
  ["Account", "Participant-owned ChatGPT / Codex / Sites"],
  ["Project", "Synthetic neighborhood garden guide"],
  ["Capture", "Editable text; optional permissioned browser speech"],
  ["Approval", "Participant decision required"],
  ["Sites", "Preview and release receipts remain separate"],
  ["Delta", "Explicit Project Delta only"],
  ["Offboarding", "Revoke access and stop future projection"]
] as const;

export function PersonalLaunchPod() {
  const [{ approved, delta }, setPodState] = useState({ approved: false, delta: false });
  return (
    <section className="prototype-card pod-card" aria-labelledby="pod-title">
      <div className="prototype-heading">
        <div><p className="card-kicker">Synthetic prototype</p><h2 id="pod-title">Personal Launch Pod</h2></div>
        <span className="safety-label">No real account connected</span>
      </div>
      <p>A separate participant sees only their authorized synthetic project and controls every outward Project Delta.</p>
      <ol className="pod-flow">
        {stages.map(([label, value], index) => (
          <li key={label} data-complete={index < 4 || (approved && index < 6) || (delta && index < 8)}>
            <span>{String(index + 1).padStart(2, "0")}</span><div><strong>{label}</strong><p>{value}</p></div>
          </li>
        ))}
      </ol>
      <div className="button-pair">
        <button className="secondary-button" type="button" onClick={() => setPodState((state) => ({ approved: !state.approved, delta: false }))}>{approved ? "Revoke synthetic approval" : "Approve synthetic packet"}</button>
        <button className="secondary-button" type="button" disabled={!approved} onClick={() => setPodState((state) => state.approved ? { ...state, delta: !state.delta } : state)}>{delta ? "Withdraw synthetic delta" : "Share synthetic Project Delta"}</button>
      </div>
      <p className="inline-state" role="status" aria-live="polite">
        {delta ? "Synthetic Project Delta prepared locally; nothing was sent." : approved ? "Synthetic participant approved locally; no account or Site was changed." : "Awaiting synthetic participant approval."}
      </p>
      <ul className="boundary-list">
        <li>Personal-memory ingestion: false</li><li>Cross-participant access: false</li><li>Raw audio retained: false</li>
      </ul>
    </section>
  );
}
