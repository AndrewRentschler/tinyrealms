/**
 * Profile role helpers for auth checks.
 * Profiles may have role from schema (profiles.role) or auth tables.
 */
export type ProfileWithRole = { role?: string };

export function isSuperuserProfile(profile: ProfileWithRole): boolean {
  return profile.role === "superuser";
}

export function getProfileRole(profile: ProfileWithRole): "superuser" | "player" {
  const r = profile.role;
  return r === "superuser" || r === "player" ? r : "player";
}
