import { TreeCommandCenter } from "./tree-command-center";
import type { TreeProgramSnapshot } from "@/lib/tree-program";

export function LaunchStudioShell({ snapshot }: { snapshot: TreeProgramSnapshot }) {
  return <TreeCommandCenter snapshot={snapshot} />;
}
