import { getEnv } from "@vercel/functions";
import { publicReadiness } from "@/lib/config";
import { NO_ATTESTATION_COMPARISON, computeTruthReadiness, observeDeploymentSelf, observeGitHubTruth, projectVercelRuntimeEnvironment } from "@/lib/live-truth";
import { readBuildProvenance } from "@/lib/provenance";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const build = readBuildProvenance();
  const github = await observeGitHubTruth({ candidateCommit: build.commit, signal: request.signal });
  const deployment = observeDeploymentSelf({
    build,
    environmentReader: () => projectVercelRuntimeEnvironment(getEnv(), process.env),
    requestUrl: request.url
  });
  const dimensions = computeTruthReadiness({ github, deployment, attestation: NO_ATTESTATION_COMPARISON }, build);
  return Response.json(publicReadiness(dimensions), {
    status: 200,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
  });
}
