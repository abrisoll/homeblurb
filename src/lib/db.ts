// Import the native-free "web" build explicitly rather than the package
// root. We only ever do remote HTTP calls (Turso, not a local file), and
// the root export resolves to the Node build with a native `libsql`
// binding unless the bundler recognizes the "netlify" export condition —
// which the Next.js function bundler doesn't, causing the native addon to
// get pulled in and fail to load in the Lambda runtime.
import { createClient } from "@libsql/client/web";
import { randomUUID } from "node:crypto";
import type { NeighborhoodProfile, ResearchJob, GenerateJob, GenerateResponseBody } from "@/lib/types";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL ?? "",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6;

function neighborhoodKey(neighborhood: string): string {
  return neighborhood.trim().toLowerCase();
}

let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = client
      .batch(
        [
          `CREATE TABLE IF NOT EXISTS neighborhood_profiles (
            zip TEXT NOT NULL,
            neighborhood_key TEXT NOT NULL,
            neighborhood TEXT NOT NULL,
            city TEXT NOT NULL,
            profile TEXT NOT NULL,
            sources TEXT NOT NULL,
            cached_at TEXT NOT NULL,
            PRIMARY KEY (zip, neighborhood_key)
          )`,
          `CREATE TABLE IF NOT EXISTS research_jobs (
            id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            neighborhood TEXT NOT NULL,
            city TEXT NOT NULL,
            zip TEXT NOT NULL,
            profile TEXT,
            sources TEXT,
            error_message TEXT,
            created_at TEXT NOT NULL
          )`,
          `CREATE TABLE IF NOT EXISTS generate_jobs (
            id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            result TEXT,
            error_message TEXT,
            created_at TEXT NOT NULL
          )`,
        ],
        "write"
      )
      .then(() => undefined);
  }
  return schemaReady;
}

export async function getCachedNeighborhoodProfile(
  zip: string,
  neighborhood: string
): Promise<NeighborhoodProfile | null> {
  await ensureSchema();

  const result = await client.execute({
    sql: `SELECT zip, neighborhood, city, profile, sources, cached_at
          FROM neighborhood_profiles
          WHERE zip = ? AND neighborhood_key = ?`,
    args: [zip.trim(), neighborhoodKey(neighborhood)],
  });

  const row = result.rows[0];
  if (!row) return null;

  const cachedAt = new Date(row.cached_at as string);
  const isFresh = Date.now() - cachedAt.getTime() < SIX_MONTHS_MS;
  if (!isFresh) return null;

  return {
    zip: row.zip as string,
    neighborhood: row.neighborhood as string,
    city: row.city as string,
    profile: row.profile as string,
    sources: JSON.parse(row.sources as string) as string[],
    cachedAt: row.cached_at as string,
  };
}

export async function saveNeighborhoodProfile(
  profile: NeighborhoodProfile
): Promise<void> {
  await ensureSchema();

  await client.execute({
    sql: `INSERT INTO neighborhood_profiles (zip, neighborhood_key, neighborhood, city, profile, sources, cached_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (zip, neighborhood_key) DO UPDATE SET
            neighborhood = excluded.neighborhood,
            city = excluded.city,
            profile = excluded.profile,
            sources = excluded.sources,
            cached_at = excluded.cached_at`,
    args: [
      profile.zip.trim(),
      neighborhoodKey(profile.neighborhood),
      profile.neighborhood.trim(),
      profile.city.trim(),
      profile.profile,
      JSON.stringify(profile.sources),
      profile.cachedAt,
    ],
  });
}

export async function createResearchJob(params: {
  neighborhood: string;
  city: string;
  zip: string;
}): Promise<string> {
  await ensureSchema();

  const id = randomUUID();
  await client.execute({
    sql: `INSERT INTO research_jobs (id, status, neighborhood, city, zip, created_at)
          VALUES (?, 'pending', ?, ?, ?, ?)`,
    args: [id, params.neighborhood, params.city, params.zip, new Date().toISOString()],
  });
  return id;
}

export async function getResearchJob(id: string): Promise<ResearchJob | null> {
  await ensureSchema();

  const result = await client.execute({
    sql: `SELECT id, status, neighborhood, city, zip, profile, sources, error_message
          FROM research_jobs WHERE id = ?`,
    args: [id],
  });

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: row.id as string,
    status: row.status as ResearchJob["status"],
    neighborhood: row.neighborhood as string,
    city: row.city as string,
    zip: row.zip as string,
    profile: (row.profile as string | null) ?? null,
    sources: row.sources ? (JSON.parse(row.sources as string) as string[]) : null,
    errorMessage: (row.error_message as string | null) ?? null,
  };
}

export async function completeResearchJob(
  id: string,
  profile: string,
  sources: string[]
): Promise<void> {
  await ensureSchema();

  await client.execute({
    sql: `UPDATE research_jobs SET status = 'done', profile = ?, sources = ? WHERE id = ?`,
    args: [profile, JSON.stringify(sources), id],
  });
}

export async function failResearchJob(id: string, errorMessage: string): Promise<void> {
  await ensureSchema();

  await client.execute({
    sql: `UPDATE research_jobs SET status = 'error', error_message = ? WHERE id = ?`,
    args: [errorMessage, id],
  });
}

export async function createGenerateJob(): Promise<string> {
  await ensureSchema();

  const id = randomUUID();
  await client.execute({
    sql: `INSERT INTO generate_jobs (id, status, created_at) VALUES (?, 'pending', ?)`,
    args: [id, new Date().toISOString()],
  });
  return id;
}

export async function getGenerateJob(id: string): Promise<GenerateJob | null> {
  await ensureSchema();

  const result = await client.execute({
    sql: `SELECT id, status, result, error_message FROM generate_jobs WHERE id = ?`,
    args: [id],
  });

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: row.id as string,
    status: row.status as GenerateJob["status"],
    result: row.result ? (JSON.parse(row.result as string) as GenerateResponseBody) : null,
    errorMessage: (row.error_message as string | null) ?? null,
  };
}

export async function completeGenerateJob(
  id: string,
  result: GenerateResponseBody
): Promise<void> {
  await ensureSchema();

  await client.execute({
    sql: `UPDATE generate_jobs SET status = 'done', result = ? WHERE id = ?`,
    args: [JSON.stringify(result), id],
  });
}

export async function failGenerateJob(id: string, errorMessage: string): Promise<void> {
  await ensureSchema();

  await client.execute({
    sql: `UPDATE generate_jobs SET status = 'error', error_message = ? WHERE id = ?`,
    args: [errorMessage, id],
  });
}
