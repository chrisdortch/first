export type ProgressEvidence = {
  id: string;
  label: string;
  state: "current" | "proposed" | "unknown" | "hold";
  detail: string;
};

export function ProgressTimeline({ items }: { items: ProgressEvidence[] }) {
  return (
    <ol className="timeline" aria-label="Evidence-only Launch Session progress">
      {items.map((item) => (
        <li key={item.id}>
          <span className={`timeline-dot ${item.state}`} aria-hidden="true" />
          <div className="timeline-copy">
            <strong>{item.label} · {item.state.toUpperCase()}</strong>
            <p>{item.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
