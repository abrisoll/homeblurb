export const TONES = [
  "Balanced",
  "Luxury",
  "Family-friendly",
  "First-time buyer",
  "Investor",
  "Waterfront-lifestyle",
] as const;

export type Tone = (typeof TONES)[number];

export interface AddressSuggestion {
  formatted: string;
  addressLine1: string | null;
  addressLine2: string | null;
}

export interface GeocodeResult {
  formattedAddress: string;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number;
  lon: number;
  /** Best available guess for the neighborhood/community name, pre-filled for agent review. */
  neighborhoodGuess: string;
  /** True when `suburb` was missing or just duplicated the city, meaning the guess needs human confirmation. */
  neighborhoodNeedsConfirmation: boolean;
}

export interface NeighborhoodProfile {
  neighborhood: string;
  city: string;
  zip: string;
  profile: string;
  sources: string[];
  cachedAt: string;
}

export interface ResearchJob {
  id: string;
  status: "pending" | "done" | "error";
  neighborhood: string;
  city: string;
  zip: string;
  profile: string | null;
  sources: string[] | null;
  errorMessage: string | null;
}

export interface GenerateRequestBody {
  address: string;
  facts: string;
  tone: Tone;
  neighborhood: string;
  city: string;
  zip: string;
  neighborhoodProfile: string;
}

export interface GenerateResponseBody {
  mls: string;
  web: string;
  social: string;
}

export interface GenerateJob {
  id: string;
  status: "pending" | "done" | "error";
  result: GenerateResponseBody | null;
  errorMessage: string | null;
}

export interface ApiErrorBody {
  error: string;
}
