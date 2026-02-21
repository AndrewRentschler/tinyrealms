function getAdminApiKey(): string | undefined {
  const g = globalThis as Record<string, unknown>;
  const proc = g["process"] as { env?: Record<string, string | undefined> } | undefined;
  return proc?.env?.["ADMIN_API_KEY"];
}

export function requireAdminKey(adminKey: string): void {
  const expected = getAdminApiKey();
  if (!expected) {
    throw new Error("Server misconfigured: ADMIN_API_KEY is not set");
  }
  if (!adminKey || adminKey !== expected) {
    throw new Error("Unauthorized: invalid admin key");
  }
}
