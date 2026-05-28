import { describe, expect, it } from "bun:test";
import { buildPgPoolConfig } from "../src/storage/pgPoolConfig.js";

describe("buildPgPoolConfig", () => {
  it("does not enable SSL for a local host", () => {
    const config = buildPgPoolConfig("postgresql://postgres:pw@localhost:5432/the_family");
    expect(config.ssl).toBeUndefined();
    expect(config.connectionString).toBe("postgresql://postgres:pw@localhost:5432/the_family");
  });

  it("enables SSL (no CA verification) for a remote host like Supabase", () => {
    const config = buildPgPoolConfig(
      "postgresql://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
    );
    expect(config.ssl).toEqual({ rejectUnauthorized: false });
  });

  it("strips sslmode from the connection string so it cannot override the ssl object", () => {
    const config = buildPgPoolConfig(
      "postgresql://postgres:pw@db.ref.supabase.co:5432/postgres?sslmode=require"
    );
    expect(config.ssl).toEqual({ rejectUnauthorized: false });
    expect(config.connectionString).not.toContain("sslmode");
  });

  it("respects an explicit sslmode=disable even on a remote host", () => {
    const config = buildPgPoolConfig("postgresql://u:p@remote.example.com:5432/db?sslmode=disable");
    expect(config.ssl).toBeUndefined();
  });

  it("respects an explicit sslmode=require even on localhost", () => {
    const config = buildPgPoolConfig("postgresql://u:p@localhost:5432/db?sslmode=require");
    expect(config.ssl).toEqual({ rejectUnauthorized: false });
  });
});
