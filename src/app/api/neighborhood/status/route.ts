import { NextResponse } from "next/server";
import { getResearchJob } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ error: "jobId is required." }, { status: 400 });
  }

  try {
    const job = await getResearchJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Research job not found." }, { status: 404 });
    }
    return NextResponse.json(job);
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ""}` : String(err);
    console.error("Failed to fetch research job:", detail);
    return NextResponse.json(
      { error: "Something went wrong while checking research status." },
      { status: 500 }
    );
  }
}
