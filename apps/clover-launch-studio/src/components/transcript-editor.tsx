"use client";

import { useEffect, useMemo, useState } from "react";

type TranscriptEditorProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function TranscriptEditor({ value, onChange, disabled = false }: TranscriptEditorProps) {
  const bytes = useMemo(() => new TextEncoder().encode(value), [value]);
  const [digest, setDigest] = useState("not-sealed");

  useEffect(() => {
    let active = true;
    void crypto.subtle.digest("SHA-256", bytes).then((buffer) => {
      if (!active) return;
      setDigest(Array.from(new Uint8Array(buffer), (part) => part.toString(16).padStart(2, "0")).join(""));
    });
    return () => { active = false; };
  }, [bytes]);

  return (
    <div className="transcript">
      <label htmlFor="reviewed-transcript">Reviewed instruction or transcript</label>
      <textarea
        id="reviewed-transcript"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        disabled={disabled}
        maxLength={64_000}
        spellCheck
        aria-describedby="voice-boundary transcript-integrity"
        placeholder="Type or paste the exact text you have reviewed…"
      />
      <div className="transcript-meta" id="transcript-integrity" aria-live="polite">
        <div className="metric"><span>UTF-8 bytes</span><code>{bytes.byteLength}</code></div>
        <div className="metric"><span>SHA-256</span><code title={digest}>{digest}</code></div>
        <div className="metric"><span>Audio retained</span><code>false</code></div>
      </div>
      <p className="voice-note" id="voice-boundary">
        You may use ChatGPT Voice outside this app, then review the exact resulting text here. Launch Studio has no microphone, native voice pipeline, or raw-audio retention.
      </p>
    </div>
  );
}
