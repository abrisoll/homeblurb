import { NextResponse } from "next/server";
import { generateDescriptions, ClaudeError } from "@/lib/claude";
import { TONES, type Tone } from "@/lib/types";

interface GenerateRequestBodyRaw {
  address?: unknown;
  facts?: unknown;
  tone?: unknown;
  neighborhood?: unknown;
  city?: unknown;
  zip?: unknown;
  neighborhoodProfile?: unknown;
}

function isTone(value: unknown): value is Tone {
  return typeof value === "string" && (TONES as readonly string[]).includes(value);
}

export async function POST(request: Request) {
  let body: GenerateRequestBodyRaw;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const address = typeof body.address === "string" ? body.address.trim() : "";
  const facts = typeof body.facts === "string" ? body.facts.trim() : "";
  const tone = isTone(body.tone) ? body.tone : "Balanced";
  const neighborhood = typeof body.neighborhood === "string" ? body.neighborhood.trim() : "";
  const city = typeof body.city === "string" ? body.city.trim() : "";
  const zip = typeof body.zip === "string" ? body.zip.trim() : "";
  const neighborhoodProfile =
    typeof body.neighborhoodProfile === "string" ? body.neighborhoodProfile.trim() : "";

  if (!address || !facts || !neighborhoodProfile) {
    return NextResponse.json(
      { error: "Address, key facts, and a neighborhood profile are required." },
      { status: 400 }
    );
  }

  try {
    const result = await generateDescriptions({
      address,
      facts,
      tone,
      neighborhood,
      city,
      zip,
      neighborhoodProfile,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ClaudeError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("Unexpected description generation error:", err);
    return NextResponse.json(
      { error: "Something went wrong while generating the description." },
      { status: 500 }
    );
  }
}
