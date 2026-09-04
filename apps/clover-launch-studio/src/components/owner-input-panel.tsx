"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActionPacketPanel } from "./action-packet-panel";
import { packetForCategory, serializeModelLaunchPacket } from "@/lib/model-launch-packets";
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

type OwnerDisposition = "approved" | "amend" | "declined" | "not-now";
type PacketBinding = {
  inputIdentity: string;
  ownerTextDigest: string;
  packetPromptDigest: string;
  packetBindingHash: string;
};
type PacketBindingState =
  | { status: "calculating" | "unavailable"; inputIdentity: string }
  | ({ status: "ready" } & PacketBinding);
type BoundDecision = {
  disposition: OwnerDisposition;
  packetBindingHash: string;
  ownerTextDigest: string;
  localSequence: number;
};

const syntheticExample = "Start a new synthetic neighborhood garden guide and show how it relates to Personal Launch Pods. Keep it no-build until source coverage is reviewed.";

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue((value as Record<string, unknown>)[key])]));
  }
  return value;
}

function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalValue(value));
}

function detachSpeechRecognition(recognition: SpeechRecognitionLike, stop: boolean) {
  try { recognition.onresult = null; } catch { /* A browser recognizer may reject handler mutation after failure. */ }
  try { recognition.onerror = null; } catch { /* A browser recognizer may reject handler mutation after failure. */ }
  try { recognition.onend = null; } catch { /* A browser recognizer may reject handler mutation after failure. */ }
  if (stop) {
    try { recognition.stop(); } catch { /* The browser may already have ended permissioned capture. */ }
  }
}

export function OwnerInputPanel({ branches }: { branches: TreeBranch[] }) {
  const [text, setText] = useState(syntheticExample);
  const [history, setHistory] = useState<OwnerTextRevision[]>([]);
  const [binding, setBinding] = useState<PacketBindingState>({ status: "calculating", inputIdentity: "initializing" });
  const [decision, setDecision] = useState<BoundDecision | null>(null);
  const [speechState, setSpeechState] = useState("Speech idle; raw audio retained: false.");
  const [speechActive, setSpeechActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revisionState, setRevisionState] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const textRef = useRef(text);
  const bindingGenerationRef = useRef(0);
  const previousBindingInputIdentityRef = useRef<string | null>(null);
  const bindingTransitionRef = useRef({ identity: "initializing", sequence: 0 });
  const decisionSequenceRef = useRef(0);
  const saveSequenceRef = useRef(0);
  const saveInFlightRef = useRef<number | null>(null);
  const analysis = useMemo(() => analyzeOwnerInput(text, branches), [branches, text]);
  const packet = useMemo(() => packetForCategory(analysis.category), [analysis.category]);
  const packetPrompt = useMemo(() => serializeModelLaunchPacket(packet), [packet]);
  const byteCount = useMemo(() => new TextEncoder().encode(text).byteLength, [text]);
  const bindingInputIdentity = useMemo(() => canonicalJson({
    schemaVersion: "clover-owner-packet-binding-input-v1",
    ownerText: text,
    ownerTextUtf8ByteCount: byteCount,
    classification: { category: analysis.category, confidence: analysis.confidence },
    affectedBranchIds: analysis.affectedBranchIds,
    understandingCheck: analysis.understandingCheck,
    recommendedOption: analysis.recommendedOption,
    predictedFruit: analysis.predictedFruit,
    launchPacketTarget: {
      packetId: packet.packetId,
      targetModelProduct: packet.targetModelProduct,
      targetThreadOrProject: packet.targetThreadOrProject,
      exactTarget: packet.exactTarget
    },
    launchPacketPrompt: packetPrompt
  }), [analysis, byteCount, packet, packetPrompt, text]);
  const currentBinding = binding.status === "ready" && binding.inputIdentity === bindingInputIdentity ? binding : null;
  const displayedDecision = currentBinding && decision?.packetBindingHash === currentBinding.packetBindingHash && decision.ownerTextDigest === currentBinding.ownerTextDigest
    ? decision.disposition
    : "pending";
  const digest = currentBinding?.ownerTextDigest ?? (binding.status === "unavailable" && binding.inputIdentity === bindingInputIdentity ? "unavailable" : "calculating");
  const decisionAvailable = currentBinding !== null && text.trim().length > 0;

  useLayoutEffect(() => {
    if (bindingTransitionRef.current.identity !== bindingInputIdentity) {
      bindingTransitionRef.current = { identity: bindingInputIdentity, sequence: bindingTransitionRef.current.sequence + 1 };
    }
  }, [bindingInputIdentity]);

  useEffect(() => {
    const previous = previousBindingInputIdentityRef.current;
    previousBindingInputIdentityRef.current = bindingInputIdentity;
    if (previous !== null && previous !== bindingInputIdentity) setDecision(null);
  }, [bindingInputIdentity]);

  useEffect(() => {
    const generation = bindingGenerationRef.current + 1;
    bindingGenerationRef.current = generation;
    void Promise.all([sha256Text(text), sha256Text(packetPrompt)]).then(async ([ownerTextDigest, packetPromptDigest]) => {
      if (!/^[0-9a-f]{64}$/u.test(ownerTextDigest) || !/^[0-9a-f]{64}$/u.test(packetPromptDigest)) {
        throw new Error("CLOVER_PACKET_BINDING_DIGEST_REJECTED");
      }
      const packetBindingHash = await sha256Text(canonicalJson({
        schemaVersion: "clover-owner-packet-binding-v1",
        ownerTextSha256: ownerTextDigest,
        ownerTextUtf8ByteCount: byteCount,
        classification: { category: analysis.category, confidence: analysis.confidence },
        affectedBranchIds: analysis.affectedBranchIds,
        understandingCheck: analysis.understandingCheck,
        recommendedOption: analysis.recommendedOption,
        predictedFruit: analysis.predictedFruit,
        launchPacketTarget: {
          packetId: packet.packetId,
          targetModelProduct: packet.targetModelProduct,
          targetThreadOrProject: packet.targetThreadOrProject,
          exactTarget: packet.exactTarget
        },
        launchPacketPromptSha256: packetPromptDigest
      }));
      if (!/^[0-9a-f]{64}$/u.test(packetBindingHash)) throw new Error("CLOVER_PACKET_BINDING_DIGEST_REJECTED");
      if (bindingGenerationRef.current === generation) {
        setBinding({ status: "ready", inputIdentity: bindingInputIdentity, ownerTextDigest, packetPromptDigest, packetBindingHash });
      }
    }).catch(() => {
      if (bindingGenerationRef.current === generation) setBinding({ status: "unavailable", inputIdentity: bindingInputIdentity });
    });
    return () => {
      if (bindingGenerationRef.current === generation) bindingGenerationRef.current += 1;
    };
  }, [analysis, bindingInputIdentity, byteCount, packet, packetPrompt, text]);

  useEffect(() => () => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) detachSpeechRecognition(recognition, true);
  }, []);

  function replaceText(nextText: string) {
    if (nextText === textRef.current) return;
    textRef.current = nextText;
    setDecision(null);
    setText(nextText);
  }

  function beginSpeech() {
    if (recognitionRef.current) {
      setSpeechState("Speech recognition is already active; no overlapping capture was started.");
      return;
    }
    const speechWindow = window as SpeechWindow;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setSpeechState("Browser speech-to-text is unavailable. Type or paste reviewed text instead.");
      return;
    }
    let recognition: SpeechRecognitionLike | null = null;
    let producedTranscript = false;
    try {
      recognition = new Recognition();
      const candidate = recognition;
      candidate.continuous = false;
      candidate.interimResults = false;
      candidate.lang = "en-US";
      candidate.onresult = (event) => {
        if (recognitionRef.current !== candidate) return;
        let transcript = "";
        for (let offset = 0; offset < event.results.length; offset += 1) transcript += event.results[offset]?.[0]?.transcript ?? "";
        const reviewedTranscript = transcript.trim();
        if (reviewedTranscript) {
          producedTranscript = true;
          replaceText(`${textRef.current.trim()} ${reviewedTranscript}`.trim());
          setSpeechState("Speech converted to editable text. Raw audio retained: false.");
        }
      };
      candidate.onerror = () => {
        if (recognitionRef.current !== candidate) return;
        recognitionRef.current = null;
        detachSpeechRecognition(candidate, true);
        setSpeechActive(false);
        setSpeechState("Speech permission or recognition failed closed. No audio was retained.");
      };
      candidate.onend = () => {
        if (recognitionRef.current !== candidate) return;
        recognitionRef.current = null;
        detachSpeechRecognition(candidate, false);
        setSpeechActive(false);
        if (!producedTranscript) setSpeechState("Speech recognition ended with no recognized text. Raw audio retained: false.");
      };
    } catch {
      if (recognition) detachSpeechRecognition(recognition, true);
      recognitionRef.current = null;
      setSpeechActive(false);
      setSpeechState("Speech permission or recognition failed closed. No audio was retained.");
      return;
    }
    recognitionRef.current = recognition;
    setSpeechActive(true);
    setSpeechState("Listening only with browser permission; raw audio is never retained by Launch Studio.");
    try {
      recognition.start();
    } catch {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      detachSpeechRecognition(recognition, true);
      setSpeechActive(false);
      setSpeechState("Speech permission or recognition failed closed. No audio was retained.");
    }
  }

  async function saveRevision() {
    if (saveInFlightRef.current !== null || !currentBinding || text.trim().length === 0) return;
    if (history.at(-1)?.text === text) {
      setRevisionState("Successor rejected: exact text is unchanged from the latest saved revision.");
      return;
    }
    const sequence = saveSequenceRef.current + 1;
    saveSequenceRef.current = sequence;
    saveInFlightRef.current = sequence;
    const capturedText = text;
    const capturedHistory = history;
    const capturedBinding = currentBinding;
    const capturedBindingTransition = bindingTransitionRef.current;
    setDecision(null);
    setSaving(true);
    setRevisionState("Computing exact immutable successor.");
    try {
      const revision = await createOwnerTextRevision(capturedText, capturedHistory);
      const revisionKeys = Object.keys(revision).sort().join(",");
      const expectedPredecessor = capturedHistory.at(-1)?.sha256 ?? null;
      if (
        revisionKeys !== "byteCount,predecessorSha256,rawAudioRetained,revision,sha256,text" ||
        revision.revision !== capturedHistory.length + 1 || revision.text !== capturedText ||
        revision.byteCount !== new TextEncoder().encode(capturedText).byteLength ||
        !/^[0-9a-f]{64}$/u.test(revision.sha256) || revision.sha256 !== capturedBinding.ownerTextDigest || revision.predecessorSha256 !== expectedPredecessor ||
        revision.rawAudioRetained !== false
      ) throw new Error("CLOVER_OWNER_REVISION_REJECTED");
      if (
        saveInFlightRef.current !== sequence || textRef.current !== capturedText ||
        bindingTransitionRef.current.identity !== capturedBinding.inputIdentity ||
        bindingTransitionRef.current.sequence !== capturedBindingTransition.sequence
      ) {
        setRevisionState("Successor was not saved because the owner text changed during calculation.");
        return;
      }
      setDecision(null);
      setHistory((current) => [...current, revision]);
      setRevisionState(null);
    } catch {
      setRevisionState("Successor calculation failed closed; nothing was saved.");
    } finally {
      if (saveInFlightRef.current === sequence) {
        saveInFlightRef.current = null;
        setSaving(false);
      }
    }
  }

  function recordDecision(disposition: OwnerDisposition) {
    if (saveInFlightRef.current !== null || saving || !currentBinding || text.trim().length === 0) return;
    const localSequence = decisionSequenceRef.current + 1;
    decisionSequenceRef.current = localSequence;
    setDecision({ disposition, packetBindingHash: currentBinding.packetBindingHash, ownerTextDigest: currentBinding.ownerTextDigest, localSequence });
  }

  return (
    <div className="owner-input-layout">
      <section className="owner-input-card" aria-labelledby="owner-input-title">
        <div className="prototype-heading">
          <div><p className="card-kicker">Synthetic / local-session input</p><h2 id="owner-input-title">Owner signal</h2></div>
          <span className="safety-label">No durable private storage</span>
        </div>
        <label htmlFor="tree-owner-input">Exact editable text</label>
        <textarea id="tree-owner-input" value={text} onChange={(event) => replaceText(event.currentTarget.value)} maxLength={64_000} />
        <div className="transcript-meta" aria-live="polite">
          <div className="metric"><span>UTF-8 bytes</span><code>{byteCount}</code></div>
          <div className="metric"><span>SHA-256</span><code title={digest}>{digest}</code></div>
          <div className="metric"><span>Audio retained</span><code>false</code></div>
        </div>
        <div className="button-pair">
          <button className="secondary-button" type="button" onClick={beginSpeech} disabled={speechActive}>Use permissioned browser speech</button>
          <button className="secondary-button" type="button" onClick={() => void saveRevision()} disabled={!decisionAvailable || saving}>{saving ? "Saving exact successor…" : "Save immutable successor"}</button>
        </div>
        <p className="inline-state" role="status" aria-live="polite">{speechState}</p>
        {revisionState !== null && <p role="status" aria-live="polite">{revisionState}</p>}
        {history.length > 0 && (
          <ol className="revision-list" aria-label="Local text successor chain">
            {history.map((revision) => (
              <li key={`${revision.revision}:${revision.sha256}`}><strong>Revision {revision.revision}</strong><code>{revision.sha256.slice(0, 14)}…</code><span>{revision.byteCount} bytes · predecessor {revision.predecessorSha256?.slice(0, 10) ?? "genesis"}</span></li>
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
        <div className="decision-buttons" role="group" aria-label="Synthetic owner decision">
          <button type="button" onClick={() => recordDecision("approved")} disabled={!decisionAvailable || saving}>Approve packet</button>
          <button type="button" onClick={() => recordDecision("amend")} disabled={!decisionAvailable || saving}>Amend</button>
          <button type="button" onClick={() => recordDecision("declined")} disabled={!decisionAvailable || saving}>Decline</button>
          <button type="button" onClick={() => recordDecision("not-now")} disabled={!decisionAvailable || saving}>Not now</button>
        </div>
        <p className="decision-state" role="status" aria-live="polite">Decision: {displayedDecision}. This local preview decision grants no execution, merge, production, messaging, payment or spending authority.</p>
      </section>

      <section className="recommended-packet" aria-labelledby="recommended-packet-title">
        <p className="card-kicker">One recommended launch packet</p>
        <h3 id="recommended-packet-title">{packet.targetModelProduct}</h3>
        <ActionPacketPanel packets={[packet]} compact />
      </section>
    </div>
  );
}
