import type { PoolConfig } from "pg";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Build pg Pool options from a connection string, enabling TLS for remote
 * hosts (e.g. Supabase, which requires SSL). We strip `sslmode` from the URL
 * because pg-connection-string parses it into its own ssl config that would
 * otherwise override the explicit `ssl` object below — passing both a
 * `sslmode=require` URL and an explicit `ssl` object makes node reject the
 * chain with SELF_SIGNED_CERT_IN_CHAIN.
 *
 * `rejectUnauthorized: true` authenticates the server certificate against the
 * system CA bundle. The Supabase pooler presents a publicly-trusted cert, so
 * this works out of the box and prevents a network attacker from MITMing the
 * connection to the ledger. If a deployment fronts Postgres with a private CA,
 * set SUPABASE_CA_PATH and pass `ssl: { ca, rejectUnauthorized: true }` instead
 * — never disable verification in production.
 */
export function buildPgPoolConfig(databaseUrl: string): PoolConfig {
  const url = new URL(databaseUrl);
  const sslmode = url.searchParams.get("sslmode");
  const isLocal = LOCAL_HOSTS.has(url.hostname);
  const needsSsl = sslmode !== null ? sslmode !== "disable" : !isLocal;

  url.searchParams.delete("sslmode");
  const connectionString = url.toString();

  return needsSsl ? { connectionString, ssl: { rejectUnauthorized: true } } : { connectionString };
}
