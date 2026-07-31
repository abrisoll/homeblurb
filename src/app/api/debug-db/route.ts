import { NextResponse } from "next/server";

export async function GET() {
  const report: Record<string, unknown> = {
    nodeVersion: process.version,
    siteUrlEnv: process.env.URL ?? null,
    NETLIFY: process.env.NETLIFY ?? null,
    NETLIFY_DEV: process.env.NETLIFY_DEV ?? null,
    AWS_LAMBDA_FUNCTION_NAME: process.env.AWS_LAMBDA_FUNCTION_NAME ?? null,
    CONTEXT: process.env.CONTEXT ?? null,
    DEPLOY_URL: process.env.DEPLOY_URL ?? null,
  };

  try {
    const db = await import("@/lib/db");
    report.dbImportOk = true;

    const cached = await db.getCachedNeighborhoodProfile("00000", "debug-probe");
    report.cacheLookupOk = true;
    report.cached = cached;

    const jobId = await db.createResearchJob({
      neighborhood: "debug-probe",
      city: "debug-city",
      zip: "00000",
    });
    report.jobCreated = jobId;

    const job = await db.getResearchJob(jobId);
    report.jobFetchOk = true;
    report.job = job;
  } catch (err) {
    report.caught = true;
    if (err instanceof Error) {
      report.errorName = err.name;
      report.errorMessage = err.message;
      report.errorStack = err.stack;
      report.errorCause = err.cause ? String(err.cause) : null;
    } else {
      report.rawError = String(err);
    }
  }

  try {
    const siteUrl = process.env.URL ?? "https://glowing-duckanoo-8971d9.netlify.app";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let res: Response;
    try {
      res = await fetch(`${siteUrl}/.netlify/functions/research-neighborhood-background`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: "debug-noop",
          neighborhood: "debug",
          city: "debug",
          state: null,
          zip: "00000",
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    report.triggerStatus = res.status;
    report.triggerOk = res.ok;
  } catch (err) {
    report.triggerCaught = true;
    if (err instanceof Error) {
      report.triggerErrorName = err.name;
      report.triggerErrorMessage = err.message;
      report.triggerErrorStack = err.stack;
      report.triggerErrorCause = err.cause ? String(err.cause) : null;
    } else {
      report.triggerRawError = String(err);
    }
  }

  return NextResponse.json(report);
}
