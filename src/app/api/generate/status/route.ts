import { NextResponse } from "next/server";
import { getGenerateJob } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ error: "jobId is required." }, { status: 400 });
  }

  try {
    const job = await getGenerateJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Generation job not found." }, { status: 404 });
    }
    return NextResponse.json(job);
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ""}` : String(err);
    console.error("Failed to fetch generate job:", detail);
    return NextResponse.json(
      { error: "Something went wrong while checking generation status." },
      { status: 500 }
    );
  }
}
