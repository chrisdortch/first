"use client";

import { useState } from "react";
import { MODEL_LAUNCH_PACKETS, serializeModelLaunchPacket, type ModelLaunchPacket } from "@/lib/model-launch-packets";

type ActionPacketPanelProps = { packets?: ModelLaunchPacket[]; compact?: boolean };

export function ActionPacketPanel({ packets = MODEL_LAUNCH_PACKETS, compact = false }: ActionPacketPanelProps) {
  const [status, setStatus] = useState("No packet copied or opened.");

  async function copyPacket(packet: ModelLaunchPacket) {
    try {
      await navigator.clipboard.writeText(serializeModelLaunchPacket(packet));
      setStatus(`${packet.targetModelProduct} packet copied exactly. Open the supported product separately.`);
    } catch {
      setStatus("Copy unavailable — select the visible packet text instead. Nothing was sent.");
    }
  }

  return (
    <div className={compact ? "packet-panel compact" : "packet-panel"}>
      <div className="packet-list">
        {packets.map((packet) => (
          <article className="packet-card" key={packet.packetId}>
            <div>
              <p className="card-kicker">Model Launch Packet</p>
              <h3>{packet.targetModelProduct}</h3>
              <p>{packet.outcome}</p>
            </div>
            <dl>
              <div><dt>Target</dt><dd>{packet.targetThreadOrProject}</dd></div>
              <div><dt>Mode</dt><dd>Copy, then open</dd></div>
              <div><dt>Cost</dt><dd>USD 0 purchase ceiling</dd></div>
              <div><dt>Authority</dt><dd>None granted by this button</dd></div>
            </dl>
            <details>
              <summary>Inspect exact packet</summary>
              <pre aria-label={`${packet.targetModelProduct} exact packet content`} role="region" tabIndex={0}>{serializeModelLaunchPacket(packet)}</pre>
            </details>
            <div className="button-pair">
              <button type="button" className="secondary-button" onClick={() => void copyPacket(packet)}>Copy exact packet</button>
              <a className="text-button" href={packet.productUrl} target="_blank" rel="noreferrer">Open supported product <span aria-hidden="true">↗</span></a>
            </div>
          </article>
        ))}
      </div>
      <p className="inline-state" role="status" aria-live="polite">{status}</p>
    </div>
  );
}
