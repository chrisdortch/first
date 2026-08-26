"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ActionPacketPanel } from "./action-packet-panel";
import { packetForCategory } from "@/lib/model-launch-packets";
import { analyzeOwnerInput, createOwnerTextRevision, sha256Text, type OwnerTextRevision } from "@/lib/owner-intake";
import type { TreeBranch } from "@/lib/tree-program";

type SpeechEvent = { results: ArrayLike<{ 0: { transcript: string }; length: number }> };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

const syntheticExample = "Start a new synthetic neighborhood garden guide and show how it relates to Personal Launch Pods. Keep it no-build until source coverage is reviewed.";

export function OwnerInputPanel({ branches }: { branches: TreeBranch[] }) {
  const [text, setText] = useState(syntheticExample);
  const [digest, setDigest] = useState("calculating");
  const [history, setHistory] = useState<OwnerTextRevision[]>([]);
  const [decision, setDecision] = useState<"pending" | "approved" | "amend" | "declined" | "not-now">("pending");
  const [speechState, setSpeechState] = useState("Speech idle; raw audio retained: false.");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const analysis = useMemo(() => analyzeOwnerInput(text, branches), [branches, text]);
  const packet = useMemo(() => packetForCategory(analysis.category), [analysis.category]);
  const byteCount = useMemo(() => new TextEncoder().encode(text).byteLength, [text]);

  useEffect(() => {
    let active = true;
    void sha256Text(text).then((hash) => { if (active) setDigest(hash); }).catch(() => { if (active) setDigest("unavailable"); });
    return () => { active = false; };
  }, [text]);

  useEffect(() => () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }, []);

  function beginSpeech() {
    const speechWindow = window as SpeechWindow;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setSpeechState("Browser speech-to-text is unavailable. Type or paste reviewed text instead.");
      return;
    }
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let transcript = "";
      for (let offset = 0; offset < event.results.length; offset += 1) transcript += event.results[offset]?.[0]?.transcript ?? "";
      if (transcript.trim()) setText((current) => `${current.trim()} ${transcript.trim()}`.trim());
      setSpeechState("Speech converted to editable text. Raw audio retained: false.");
    };
    recognition.onerror = () => setSpeechState("Speech permission or recognition failed closed. No audio was retained.");
    recognition.onend = () => { recognitionRef.current = null; };
    recognitionRef.current = recognition;
    setSpeechState("Listening only with browser permission; raw audio is never retained by Launch Studio.");
    recognition.start();
  }

  async function saveRevision() {
    const revision = await createOwnerTextRevision(text, history);
    setHistory((current) => [...current, revision]);
    setDecision("pending");
  }

  return (
    <div className="owner-input-layout">
      <section className="owner-input-card" aria-labelledby="owner-input-title">
        <div className="prototype-heading">
          <div><p className="card-kicker">Synthetic / local-session input</p><h3 id="owner-input-title">Owner signal</h3></div>
          <span className="safety-label">No durable private storage</span>
        </div>
        <label htmlFor="tree-owner-input">Exact editable text</label>
        <textarea id="tree-owner-input" value={text} onChange={(event) => setText(event.currentTarget.value)} maxLength={64_000} />
        <div className="transcript-meta" aria-live="polite">
          <div className="metric"><span>UTF-8 bytes</span><code>{byteCount}</code></div>
          <div className="metric"><span>SHA-256</span><code title={digest}>{digest}</code></div>
          <div className="metric"><span>Audio retained</span><code>false</code></div>
        </div>
        <div className="button-pair">
          <button className="secondary-button" type="button" onClick={beginSpeech}>Use permissioned browser speech</button>
          <button className="secondary-button" type="button" onClick={() => void saveRevision()} disabled={text.trim().length === 0}>Save immutable successor</button>
        </div>
        <p className="inline-state" role="status" aria-live="polite">{speechState}</p>
        {history.length > 0 && (
          <ol className="revision-list" aria-label="Local text successor chain">
            {history.map((revision) => (
              <li key={revision.sha256}><strong>Revision {revision.revision}</strong><code>{revision.sha256.slice(0, 14)}…</code><span>{revision.byteCount} bytes · predecessor {revision.predecessorSha256?.slice(0, 10) ?? "genesis"}</span></li>
            ))}
          </ol>
        )}
      </section>

      <section className="understanding-card" aria-labelledby="understanding-title">
        <p className="card-kicker">Understanding Check</p>
        <h3 id="understanding-title">{analysis.category}</h3>
        <p>{analysis.understandingCheck}</p>
        <dl className="analysis-grid">
          <div><dt>Affected branches</dt><dd>{analysis.affectedBranchIds.join(", ")}</dd></div>
          <div><dt>Source coverage</dt><dd><ul>{analysis.sourceCoverageRequirements.map((item) => <li key={item}>{item}</li>)}</ul></dd></div>
          <div><dt>Predicted fruit</dt><dd>{analysis.predictedFruit}</dd></div>
          <div><dt>Recommended option</dt><dd>{analysis.recommendedOption}</dd></div>
        </dl>
        <div className="decision-buttons" aria-label="Synthetic owner decision">
          <button type="button" onClick={() => setDecision("approved")}>Approve packet</button>
          <button type="button" onClick={() => setDecision("amend")}>Amend</button>
          <button type="button" onClick={() => setDecision("declined")}>Decline</button>
          <button type="button" onClick={() => setDecision("not-now")}>Not now</button>
        </div>
        <p className="decision-state" role="status" aria-live="polite">Decision: {decision}. This local preview decision grants no execution, merge, production, messaging, payment or spending authority.</p>
      </section>

      <section className="recommended-packet" aria-labelledby="recommended-packet-title">
        <p className="card-kicker">One recommended launch packet</p>
        <h3 id="recommended-packet-title">{packet.targetModelProduct}</h3>
        <ActionPacketPanel packets={[packet]} compact />
      </section>
    </div>
  );
}
