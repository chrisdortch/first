const DIMENSIONS = [
  "release",
  "sitesSave",
  "commit",
  "pullRequest",
  "deployment",
  "dataSchema",
  "backup",
  "verification",
  "rollback"
];

export function projectRegistryForCore(registry) {
  return {
    documentType: "clover-core-portfolio-projection",
    schemaVersion: "2.0.0",
    status: "candidate-unmerged-undeployed",
    sourceRegistry: {
      path: "portfolio/registry/versions/2.0.0/registry.json",
      schemaVersion: registry.schemaVersion
    },
    architecture: {
      pattern: registry.architecture.pattern,
      kernelProjectId: registry.architecture.kernelProjectId,
      ownerWindowProjectId: registry.architecture.ownerWindowProjectId,
      contextGatewayProjectId: registry.architecture.contextGatewayProjectId,
      knowledgeSubsystemProjectId: registry.architecture.knowledgeSubsystemProjectId,
      rawCellDataStoredInKernel: false
    },
    projectionPolicy: {
      minimumNecessary: true,
      rawCellDataIncluded: false,
      unknownsPreserved: true
    },
    projects: [...registry.records]
      .sort((left, right) => left.projectId.localeCompare(right.projectId))
      .map((record) => ({
        projectId: record.projectId,
        title: record.title,
        classification: record.classification,
        lifecycle: record.lifecycle,
        architectureRole: record.architectureRole,
        verificationStatus: record.verificationStatus,
        sourceOfTruthStatus: record.sourceOfTruth.status,
        rawCellDataStoredInCore: record.sourceOfTruth.rawCellDataStoredInCore,
        projectionBoundary: record.coreProjection,
        relationships: record.relationships,
        identitySummary: record.versionIdentities.map((identity) => ({
          identityId: identity.identityId,
          role: identity.role,
          ...Object.fromEntries(DIMENSIONS.map((dimension) => [
            dimension,
            {
              status: identity[dimension].status,
              value: identity[dimension].value
            }
          ]))
        })),
        unknowns: record.unknowns,
        nextMilestone: record.nextMilestone
      }))
  };
}
