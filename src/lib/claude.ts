import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { GenerateResponseBody, Tone } from "@/lib/types";

const MODEL = "claude-opus-5";

const client = new Anthropic();

export class ClaudeError extends Error {}

interface ResearchParams {
  neighborhood: string;
  city: string;
  state: string | null;
  zip: string;
}

interface ResearchResult {
  profile: string;
  sources: string[];
}

const RESEARCH_SYSTEM_PROMPT = `You are a real estate neighborhood researcher. Given a neighborhood/community name, city, state, and zip code, use web search to research the area: schools (by name, without ranking implications), parks and recreation, walkability, lifestyle amenities, and general market context.

Source priority:
- For a named HOA or master-planned community, search specifically for the community's official/HOA website and prioritize it as your source for amenities (pools, clubhouse, sports fields, trails, splash pads, etc.).
- Otherwise prefer credible, informational sources: city/county government pages, local news, chamber of commerce, school district sites, and neutral market-data sites.
- Never use real estate listing sites (Zillow, Realtor.com, Redfin, Trulia, individual MLS listings, etc.) as a source, and never copy or closely paraphrase their text.

Rules:
- Never state that an amenity exists unless a source you found actually confirms it. If you cannot confirm specific amenities, describe the area more generally instead of guessing.
- Write entirely in your own words. Do not quote or lift phrasing from any source.
- Do not reference or imply suitability based on race, religion, national origin, familial status, disability, or any other protected class.

Output format — respond with exactly this structure and nothing else:

PROFILE:
<a single original paragraph, 150-200 words, describing the neighborhood/community>

SOURCES:
<one source URL per line, only the sources you actually used>`;

function extractTextBlocks(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

export async function researchNeighborhood(
  params: ResearchParams
): Promise<ResearchResult> {
  const userPrompt = `Neighborhood/community: ${params.neighborhood}
City: ${params.city}
State: ${params.state ?? "unknown"}
Zip: ${params.zip}`;

  let messages: Anthropic.MessageParam[] = [
    { role: "user", content: userPrompt },
  ];

  const researchTools: Anthropic.Messages.ToolUnion[] = [
    { type: "web_search_20260209", name: "web_search", max_uses: 6 },
  ];
  const MAX_TOKENS = 8192;
  const MAX_RESUME_ROUNDS = 4;

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: RESEARCH_SYSTEM_PROMPT,
    tools: researchTools,
    messages,
  });

  // Server-side tool loop can pause after its internal iteration limit;
  // resume by resending the accumulated turn rather than a fresh "continue" message.
  // Bounded so a stubborn research task can't run away in latency or cost.
  let resumeRounds = 0;
  while (response.stop_reason === "pause_turn" && resumeRounds < MAX_RESUME_ROUNDS) {
    resumeRounds += 1;
    messages = [...messages, { role: "assistant", content: response.content }];
    response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: RESEARCH_SYSTEM_PROMPT,
      tools: researchTools,
      messages,
    });
  }

  if (response.stop_reason === "refusal") {
    throw new ClaudeError("Neighborhood research was declined by the model.");
  }

  if (response.stop_reason === "max_tokens") {
    throw new ClaudeError(
      "Neighborhood research response was cut off. Please try again."
    );
  }

  const text = extractTextBlocks(response.content);
  const profileMatch = text.match(/PROFILE:\s*([\s\S]*?)\s*SOURCES:/i);
  const sourcesMatch = text.match(/SOURCES:\s*([\s\S]*)$/i);

  // Fall back to the trailing text if the model didn't hit the exact
  // PROFILE:/SOURCES: format — a near-miss shouldn't waste a multi-minute call.
  const profile =
    profileMatch?.[1]?.trim() ||
    text.replace(/^[\s\S]*?PROFILE:\s*/i, "").trim() ||
    undefined;

  if (!profile) {
    throw new ClaudeError(
      "Could not parse a neighborhood profile from the research response."
    );
  }

  const sources = (sourcesMatch?.[1] ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.startsWith("http"));

  return { profile, sources };
}

const FAIR_HOUSING_RULE = `Fair Housing Act compliance is a hard, non-negotiable requirement. Never reference, imply, or hint at the suitability, safety, or desirability of the property or area based on race, color, religion, sex, national origin, familial status, or disability — or any proxy for these (e.g. "great for families", "safe neighborhood", "walkable to churches", "perfect for retirees", "no kids", "quiet professionals only"). Describe the property and neighborhood using objective, verifiable facts only: square footage, features, finishes, school names (never rankings or "top-rated" claims implying exclusivity), parks, walkability, commute access, and confirmed amenities. If a requested tone would require a fair housing violation to honor, quietly ignore that part rather than violate the rule.`;

const GENERATION_SYSTEM_PROMPT = `You are an expert real estate copywriter who writes SEO-optimized, emotionally compelling, and factually accurate property descriptions.

${FAIR_HOUSING_RULE}

You will be given the property's facts, a neighborhood profile, and a desired tone. Using only the facts provided (do not invent property details), write three versions of the description:

1. "mls": approximately 250 words, suitable for MLS/broker syndication — factual, compelling, no fair housing violations.
2. "web": an extended web/listing-site version (roughly 400-550 words) that is SEO-friendly and emotionally engaging, weaving in relevant neighborhood context from the provided profile.
3. "social": a short social media caption (2-4 sentences, under 350 characters), upbeat and shareable, may include 1-3 relevant hashtags.

Naturally incorporate the requested tone. Do not fabricate amenities, schools, or neighborhood facts beyond what is given to you.`;

const GenerateSchema = z.object({
  mls: z.string(),
  web: z.string(),
  social: z.string(),
});

interface GenerateParams {
  address: string;
  facts: string;
  tone: Tone;
  neighborhood: string;
  city: string;
  zip: string;
  neighborhoodProfile: string;
}

export async function generateDescriptions(
  params: GenerateParams
): Promise<GenerateResponseBody> {
  const userPrompt = `Property address: ${params.address}
Neighborhood: ${params.neighborhood}, ${params.city} ${params.zip}
Tone: ${params.tone}

Key facts about the property:
${params.facts}

Neighborhood profile:
${params.neighborhoodProfile}`;

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4096,
    system: GENERATION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    output_config: { format: zodOutputFormat(GenerateSchema) },
  });

  if (response.stop_reason === "refusal") {
    throw new ClaudeError("Description generation was declined by the model.");
  }

  if (!response.parsed_output) {
    throw new ClaudeError("Could not parse the generated description output.");
  }

  return response.parsed_output;
}
