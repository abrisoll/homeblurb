import type { Config } from "@netlify/functions";
import { generateDescriptions } from "../../src/lib/claude";
import { completeGenerateJob, failGenerateJob } from "../../src/lib/db";
import type { Tone } from "../../src/lib/types";

interface GenerateJobPayload {
  jobId: string;
  address: string;
  facts: string;
  tone: Tone;
  neighborhood: string;
  city: string;
  zip: string;
  neighborhoodProfile: string;
}

const handler = async (req: Request) => {
  const { jobId, address, facts, tone, neighborhood, city, zip, neighborhoodProfile } =
    (await req.json()) as GenerateJobPayload;

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

    await completeGenerateJob(jobId, result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Description generation failed unexpectedly.";
    console.error("Background description generation failed:", err);
    try {
      await failGenerateJob(jobId, message);
    } catch (dbErr) {
      console.error("Failed to record generate job failure:", dbErr);
    }
  }
};

export default handler;

export const config: Config = {
  background: true,
};
