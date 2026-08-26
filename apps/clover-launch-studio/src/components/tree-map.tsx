import type { TreeBranch, TreeRelationship } from "@/lib/tree-program";

type TreeMapProps = { branches: TreeBranch[]; relationships: TreeRelationship[] };

const familyOrder: TreeBranch["family"][] = ["root", "trunk", "bark", "ring", "branch", "canopy", "fruit", "pod", "collaboration"];
const familyLabels: Record<TreeBranch["family"], string> = {
  root: "Roots",
  trunk: "Trunk",
  bark: "Protective bark",
  ring: "Rings",
  branch: "Project branches",
  canopy: "Canopy",
  fruit: "Fruit",
  pod: "Launch pods",
  collaboration: "Collaboration"
};

export function TreeMap({ branches, relationships }: TreeMapProps) {
  return (
    <div className="tree-map" aria-label="Clover Tree program graph">
      <div className="tree-map-grid">
        {familyOrder.map((family) => {
          const matches = branches.filter((branch) => branch.family === family);
          if (matches.length === 0) return null;
          return (
            <section className={`tree-family tree-family-${family}`} key={family} aria-labelledby={`family-${family}`}>
              <header>
                <span className="family-line" aria-hidden="true" />
                <h3 id={`family-${family}`}>{familyLabels[family]}</h3>
                <span>{matches.length}</span>
              </header>
              <ul>
                {matches.map((branch) => (
                  <li className="tree-node" key={branch.branchId} data-status={branch.currentHealth}>
                    <div className="node-heading">
                      <span className="status-dot" aria-hidden="true" />
                      <strong>{branch.title}</strong>
                    </div>
                    <p>{branch.purpose}</p>
                    <div className="node-meta">
                      <span>{branch.currentHealth}</span>
                      <span>{branch.trajectory}</span>
                      <span>{branch.sourceFreshness} source</span>
                    </div>
                    <p className="next-gate"><span>Next gate</span>{branch.nextGate}</p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <details className="relationship-ledger">
        <summary>{relationships.length} typed relationships</summary>
        <ul>
          {relationships.map((relationship) => (
            <li key={relationship.relationshipId}>
              <code>{relationship.fromBranchId.replace("branch:", "")}</code>
              <span>{relationship.relationshipType}</span>
              <code>{relationship.toBranchId.replace("branch:", "")}</code>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
