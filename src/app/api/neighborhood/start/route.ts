import { NextResponse } from "next/server";
import {
  getCachedNeighborhoodProfile,
  createResearchJob,
  failResearchJob,
  saveNeighborhoodProfile,
} from "@/lib/db";
import { researchNeighborhood, ClaudeError } from "@/lib/claude";

interface StartRequestBody {
  neighborhood?: unknown;
  city?: unknown;
  state?: unknown;
  zip?: unknown;
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    const cause = err.cause ? ` | cause: ${String(err.cause)}` : "";
    return `${err.name}: ${err.message}${cause}\n${err.stack ?? ""}`;
  }
  return String(err);
}

async function handlePost(request: Request) {
  let body: StartRequestBody;
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
      return NextResponse.json({
        status: "done",
        profile: cached.profile,
        sources: cached.sources,
        fromCache: true,
      });
    }
  } catch (err) {
    console.error("Neighborhood cache lookup failed, continuing without cache:", describeError(err));
  }

  // On Netlify, research runs in a Background Function (up to 15 minutes)
  // instead of this request, because live web-search research routinely
  // exceeds Netlify's ~60s limit for synchronous functions. The client
  // polls /api/neighborhood/status for the result.
  //
  // `process.env.NETLIFY` is a build-time flag only — it's not forwarded
  // into the deployed function's runtime environment, so it's always
  // falsy here even in production. `AWS_LAMBDA_FUNCTION_NAME` is set by
  // the Lambda runtime itself (which Netlify Functions run on) and is a
  // reliable way to detect "running as a deployed function" vs local dev.
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    let jobId: string;
    try {
      jobId = await createResearchJob({ neighborhood, city, zip });
    } catch (err) {
      console.error("Failed to create research job:", describeError(err));
      return NextResponse.json(
        { error: "Something went wrong while starting neighborhood research." },
        { status: 500 }
      );
    }

    const siteUrl = process.env.URL ?? new URL(request.url).origin;
    const triggerUrl = `${siteUrl}/.netlify/functions/research-neighborhood-background`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      let triggerRes: Response;
      try {
        triggerRes = await fetch(triggerUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, neighborhood, city, state, zip }),
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
      console.error("Failed to trigger background research function:", describeError(err));
      await failResearchJob(jobId, "Failed to start neighborhood research.").catch((e) =>
        console.error("Also failed to mark job as failed:", describeError(e))
      );
      return NextResponse.json(
        { error: "Failed to start neighborhood research." },
        { status: 500 }
      );
    }

    return NextResponse.json({ status: "pending", jobId });
  }

  // Local dev: no Netlify Background Functions under `next dev`, and no
  // ~60s limit to worry about, so just do the research inline.
  try {
    const { profile, sources } = await researchNeighborhood({
      neighborhood,
      city,
      state,
      zip,
    });

    try {
      await saveNeighborhoodProfile({
        neighborhood,
        city,
        zip,
        profile,
        sources,
        cachedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Failed to cache neighborhood profile:", describeError(err));
    }

    return NextResponse.json({ status: "done", profile, sources, fromCache: false });
  } catch (err) {
    if (err instanceof ClaudeError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("Unexpected neighborhood research error:", describeError(err));
    return NextResponse.json(
      { error: "Something went wrong while researching the neighborhood." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    return await handlePost(request);
  } catch (err) {
    // Last-resort safety net: never let an uncaught exception surface as an
    // opaque platform-level 502 with no diagnostic information.
    console.error("Unhandled error in /api/neighborhood/start:", describeError(err));
    return NextResponse.json(
      { error: "Something went wrong while starting neighborhood research." },
      { status: 500 }
    );
  }
}
