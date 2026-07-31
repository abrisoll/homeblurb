import type { Config } from "@netlify/functions";
import { researchNeighborhood } from "../../src/lib/claude";
import {
  completeResearchJob,
  failResearchJob,
  saveNeighborhoodProfile,
} from "../../src/lib/db";

interface ResearchJobPayload {
  jobId: string;
  neighborhood: string;
  city: string;
  state: string | null;
  zip: string;
}

const handler = async (req: Request) => {
  const { jobId, neighborhood, city, state, zip } =
    (await req.json()) as ResearchJobPayload;

  try {
    const { profile, sources } = await researchNeighborhood({
      neighborhood,
      city,
      state,
      zip,
    });

    await completeResearchJob(jobId, profile, sources);
    await saveNeighborhoodProfile({
      neighborhood,
      city,
      zip,
      profile,
      sources,
      cachedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Neighborhood research failed unexpectedly.";
    console.error("Background neighborhood research failed:", err);
    try {
      await failResearchJob(jobId, message);
    } catch (dbErr) {
      console.error("Failed to record research job failure:", dbErr);
    }
  }
};

export default handler;

export const config: Config = {
  background: true,
};
