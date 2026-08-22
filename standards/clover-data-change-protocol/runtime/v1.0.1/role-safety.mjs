export const REHEARSAL_ROLE_NAME = "clover_rehearsal";

export function validateRestrictedRoleObservation(observation, expectedRole = REHEARSAL_ROLE_NAME) {
  const failures = [];
  if (!observation || typeof observation !== "object" || Array.isArray(observation)) return ["Restricted rehearsal role observation is missing"];
  if (observation.roleName !== expectedRole) failures.push(`Rehearsal role is ${observation.roleName || "(missing)"}, expected ${expectedRole}`);
  const deniedCapabilities = ["superuser", "createDatabase", "createRole", "replication", "bypassRowLevelSecurity", "inherit"];
  for (const capability of deniedCapabilities) if (observation[capability] !== false) failures.push(`Rehearsal role capability must be false: ${capability}`);
  if (observation.canLogin !== true) failures.push("Rehearsal role must be login-enabled");
  if (!Array.isArray(observation.memberships) || observation.memberships.length !== 0) failures.push("Rehearsal role must have no inherited role memberships");
  return failures;
}
