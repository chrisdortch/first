import { NextResponse } from "next/server";
import { getEnv } from "@vercel/functions";
import { CLOVER_EXTERNAL_OBSERVATION, NO_ATTESTATION_COMPARISON, READ_ONLY_AUTHORITY, baselineObservationTime, observeDeploymentSelf, observeGitHubTruth, projectVercelRuntimeEnvironment, reconcileTreeTruth } from "@/lib/live-truth";
import { readBuildProvenance } from "@/lib/provenance";
import { getTreeProgramSnapshot } from "@/lib/tree-program";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestObservedAt = new Date().toISOString();
  const immutableRecords = getTreeProgramSnapshot();
  const build = readBuildProvenance();
  const github = await observeGitHubTruth({ candidateCommit: build.commit, signal: request.signal });
  const deploymentSelf = observeDeploymentSelf({
    build,
    environmentReader: () => projectVercelRuntimeEnvironment(getEnv(), process.env),
    requestUrl: request.url
  });
  const reconciled = reconcileTreeTruth({
    baseline: immutableRecords,
    build,
    github,
    deployment: deploymentSelf,
    attestation: NO_ATTESTATION_COMPARISON
  });
  return NextResponse.json({
    schemaVersion: "clover-tree-live-readback-v0.2",
    baseline: {
      baselineObservedAt: baselineObservationTime(immutableRecords),
      indexId: immutableRecords.index.indexId,
      indexHash: immutableRecords.index.indexHash,
      classification: "historical-source-bound-baseline",
      immutableRecords
    },
    observations: { github, deploymentSelf, clover: CLOVER_EXTERNAL_OBSERVATION },
    reconciled,
    requestObservedAt,
    authority: READ_ONLY_AUTHORITY
  }, {
    headers: {
      "Cache-Control": "no-store",
      "Vary": "Accept"
    }
  });
}
