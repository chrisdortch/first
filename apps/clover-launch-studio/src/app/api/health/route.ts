import { publicReadiness } from "@/lib/config";
import { NO_ATTESTATION_COMPARISON, computeTruthReadiness, observeDeploymentSelf, observeGitHubTruth } from "@/lib/live-truth";
import { readBuildProvenance } from "@/lib/provenance";

export const runtime = "nodejs";

export async function GET() {
  const build = readBuildProvenance();
  const github = await observeGitHubTruth({ candidateCommit: build.commit });
  const deployment = observeDeploymentSelf();
  const dimensions = computeTruthReadiness({ github, deployment, attestation: NO_ATTESTATION_COMPARISON }, build);
  return Response.json(publicReadiness(dimensions), {
    status: 200,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
  });
}
