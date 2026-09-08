type DecisionRailProps = {
  title: string;
  description: string;
  state: "pending" | "unavailable" | "hold";
};

export function DecisionRail({ title, description, state }: DecisionRailProps) {
  return (
    <article className="decision-rail" aria-label={`${title}: ${state}`}>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <span className="rail-state">{state}</span>
    </article>
  );
}
