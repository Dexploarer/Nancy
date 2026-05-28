import type { PoolConfig } from "pg";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Build pg Pool options from a connection string, enabling TLS for remote
 * hosts (e.g. Supabase, which requires SSL). We strip `sslmode` from the URL
 * because pg-connection-string parses it into its own ssl config that would
 * otherwise override the explicit `ssl` object below — passing both a
 * `sslmode=require` URL and `ssl: { rejectUnauthorized: false }` makes node
 * reject Supabase's chain with SELF_SIGNED_CERT_IN_CHAIN.
 *
 * `rejectUnauthorized: false` skips CA verification, which is the pragmatic
 * default for managed Postgres (Supabase/RDS) whose chains node does not trust
 * out of the box. Harden by bundling the provider CA if stricter TLS is needed.
 */
export function buildPgPoolConfig(databaseUrl: string): PoolConfig {
  const url = new URL(databaseUrl);
  const sslmode = url.searchParams.get("sslmode");
  const isLocal = LOCAL_HOSTS.has(url.hostname);
  const needsSsl = sslmode !== null ? sslmode !== "disable" : !isLocal;

  url.searchParams.delete("sslmode");
  const connectionString = url.toString();

  return needsSsl ? { connectionString, ssl: { rejectUnauthorized: false } } : { connectionString };
}
