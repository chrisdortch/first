import { LaunchStudioShell } from "@/components/launch-studio-shell";

const initialProgress = [
  { id: "source", label: "Source candidate", state: "proposed" as const, detail: "Local source only; validation has not run." },
  { id: "understanding", label: "Understanding Check", state: "unknown" as const, detail: "Awaiting an authenticated owner session." },
  { id: "context", label: "Context Pack", state: "unknown" as const, detail: "No private context has been loaded." },
  { id: "impact", label: "Impact Scan", state: "hold" as const, detail: "Provider and production impacts remain outside this gate." },
  { id: "charter", label: "Build Charter", state: "proposed" as const, detail: "Every later decision remains separate." }
];

export default function LaunchStudioPage() {
  return (
    <main id="main-content">
      <LaunchStudioShell
        sourceLabel="Action 006 · local source candidate"
        freshnessLabel="Unvalidated · no preview"
        initialProgress={initialProgress}
      />
    </main>
  );
}
