import { LaunchStudioShell } from "@/components/launch-studio-shell";
import { getTreeProgramSnapshot } from "@/lib/tree-program";

export default function LaunchStudioPage() {
  return <LaunchStudioShell snapshot={getTreeProgramSnapshot()} />;
}
