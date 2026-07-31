import { NextResponse } from "next/server";
import { getCachedNeighborhoodProfile, saveNeighborhoodProfile } from "@/lib/db";
import { researchNeighborhood, ClaudeError } from "@/lib/claude";

interface NeighborhoodRequestBody {
  neighborhood?: unknown;
  city?: unknown;
  state?: unknown;
  zip?: unknown;
}

export async function POST(request: Request) {
  let body: NeighborhoodRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const neighborhood = typeof body.neighborhood === "string" ? body.neighborhood.trim() : "";
  const city = typeof body.city === "string" ? body.city.trim() : "";
  const state = typeof body.state === "string" ? body.state.trim() : null;
  const zip = typeof body.zip === "string" ? body.zip.trim() : "";

  if (!neighborhood || !zip) {
    return NextResponse.json(
      { error: "Neighborhood and zip are required." },
      { status: 400 }
    );
  }

  try {
    const cached = await getCachedNeighborhoodProfile(zip, neighborhood);
    if (cached) {
      return NextResponse.json({ ...cached, fromCache: true });
    }
  } catch (err) {
    console.error("Neighborhood cache lookup failed, continuing without cache:", err);
  }

  try {
    const { profile, sources } = await researchNeighborhood({
      neighborhood,
      city,
      state,
      zip,
    });

    const record = {
      neighborhood,
      city,
      zip,
      profile,
      sources,
      cachedAt: new Date().toISOString(),
    };

    try {
      await saveNeighborhoodProfile(record);
    } catch (err) {
      console.error("Failed to cache neighborhood profile:", err);
    }

    return NextResponse.json({ ...record, fromCache: false });
  } catch (err) {
    if (err instanceof ClaudeError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("Unexpected neighborhood research error:", err);
    return NextResponse.json(
      { error: "Something went wrong while researching the neighborhood." },
      { status: 500 }
    );
  }
}
