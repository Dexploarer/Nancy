import { readFileSync } from "node:fs";
import { rootCertificates } from "node:tls";
import type { PoolConfig } from "pg";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

// Supabase serves Postgres behind its own private CA ("Supabase Root 2021 CA",
// sha256 80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA),
// which is in no public trust store — verifying against the default roots fails with
// SELF_SIGNED_CERT_IN_CHAIN. We pin that root alongside the bundled public roots and
// KEEP verification on, so the channel to the ledger is authenticated (MITM-resistant)
// while still working against any publicly-trusted Postgres host.
const SUPABASE_ROOT_CA = readFileSync(new URL("../../certs/supabase-root-2021-ca.crt", import.meta.url), "utf8");
const TRUSTED_CA_CERTS: string[] = [...rootCertificates, SUPABASE_ROOT_CA];

/**
 * Build pg Pool options from a connection string, enabling verified TLS for
 * remote hosts (e.g. Supabase, which requires SSL). We strip `sslmode` from the
 * URL because pg-connection-string parses it into its own ssl config that would
 * otherwise override the explicit `ssl` object below.
 */
export function buildPgPoolConfig(databaseUrl: string): PoolConfig {
  const url = new URL(databaseUrl);
  const sslmode = url.searchParams.get("sslmode");
  const isLocal = LOCAL_HOSTS.has(url.hostname);
  const needsSsl = sslmode !== null ? sslmode !== "disable" : !isLocal;

  url.searchParams.delete("sslmode");
  const connectionString = url.toString();

  return needsSsl ? { connectionString, ssl: { ca: TRUSTED_CA_CERTS, rejectUnauthorized: true } } : { connectionString };
}
