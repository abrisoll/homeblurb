import { NextResponse } from "next/server";
import { generateDescriptions, ClaudeError } from "@/lib/claude";
import { createGenerateJob, failGenerateJob } from "@/lib/db";
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

function describeError(err: unknown): string {
  if (err instanceof Error) {
    const cause = err.cause ? ` | cause: ${String(err.cause)}` : "";
    return `${err.name}: ${err.message}${cause}\n${err.stack ?? ""}`;
  }
  return String(err);
}

async function handlePost(request: Request) {
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

  // Generation is usually well under Netlify's ~60s synchronous function
  // limit, but occasionally runs long enough to hit it — so it gets the
  // same background-job treatment as neighborhood research.
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    let jobId: string;
    try {
      jobId = await createGenerateJob();
    } catch (err) {
      console.error("Failed to create generate job:", describeError(err));
      return NextResponse.json(
        { error: "Something went wrong while starting description generation." },
        { status: 500 }
      );
    }

    const siteUrl = process.env.URL ?? new URL(request.url).origin;
    const triggerUrl = `${siteUrl}/.netlify/functions/generate-listing-background`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      let triggerRes: Response;
      try {
        triggerRes = await fetch(triggerUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId,
            address,
            facts,
            tone,
            neighborhood,
            city,
            zip,
            neighborhoodProfile,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      if (!triggerRes.ok) {
        throw new Error(
          `Background function trigger to ${triggerUrl} returned ${triggerRes.status}`
        );
      }
    } catch (err) {
      console.error("Failed to trigger background generation function:", describeError(err));
      await failGenerateJob(jobId, "Failed to start description generation.").catch((e) =>
        console.error("Also failed to mark job as failed:", describeError(e))
      );
      return NextResponse.json(
        { error: "Failed to start description generation." },
        { status: 500 }
      );
    }

    return NextResponse.json({ status: "pending", jobId });
  }

  // Local dev: no Netlify Background Functions under `next dev`.
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
    return NextResponse.json({ status: "done", result });
  } catch (err) {
    if (err instanceof ClaudeError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("Unexpected description generation error:", describeError(err));
    return NextResponse.json(
      { error: "Something went wrong while generating the description." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    return await handlePost(request);
  } catch (err) {
    console.error("Unhandled error in /api/generate/start:", describeError(err));
    return NextResponse.json(
      { error: "Something went wrong while starting description generation." },
      { status: 500 }
    );
  }
}
