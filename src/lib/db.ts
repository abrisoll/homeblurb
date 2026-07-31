import { createClient } from "@libsql/client";
import type { NeighborhoodProfile } from "@/lib/types";

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
      .execute(
        `CREATE TABLE IF NOT EXISTS neighborhood_profiles (
          zip TEXT NOT NULL,
          neighborhood_key TEXT NOT NULL,
          neighborhood TEXT NOT NULL,
          city TEXT NOT NULL,
          profile TEXT NOT NULL,
          sources TEXT NOT NULL,
          cached_at TEXT NOT NULL,
          PRIMARY KEY (zip, neighborhood_key)
        )`
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
