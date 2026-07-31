import type { AddressSuggestion, GeocodeResult } from "@/lib/types";

interface GeoapifyProperties {
  formatted?: string;
  street?: string;
  suburb?: string;
  district?: string;
  neighbourhood?: string;
  city?: string;
  state?: string;
  postcode?: string;
  lat?: number;
  lon?: number;
  result_type?: string;
}

// Match precision levels that indicate Geoapify actually located this specific
// address rather than falling back to a broader area (e.g. county-level).
const ADDRESS_LEVEL_RESULT_TYPES = new Set([
  "building",
  "amenity",
  "street",
  "postcode",
]);

interface GeoapifyResponse {
  results?: Array<GeoapifyProperties>;
}

export class GeocodeError extends Error {}

function normalize(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    throw new GeocodeError(
      "GEOAPIFY_API_KEY is not configured on the server."
    );
  }

  const url = new URL("https://api.geoapify.com/v1/geocode/search");
  url.searchParams.set("text", address);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("apiKey", apiKey);

  let res: Response;
  try {
    res = await fetch(url.toString());
  } catch {
    throw new GeocodeError("Could not reach the Geoapify geocoding service.");
  }

  if (!res.ok) {
    throw new GeocodeError(
      `Geoapify geocoding request failed (status ${res.status}).`
    );
  }

  const data = (await res.json()) as GeoapifyResponse;
  const result = data.results?.[0];

  if (!result || result.lat == null || result.lon == null) {
    throw new GeocodeError(
      "Could not find that address. Please check it and try again."
    );
  }

  if (
    result.result_type &&
    !ADDRESS_LEVEL_RESULT_TYPES.has(result.result_type)
  ) {
    throw new GeocodeError(
      "Could not find a precise match for that address. Please check the street number and spelling and try again."
    );
  }

  const suburb = result.suburb ?? null;
  const city = result.city ?? null;

  // Newer master-planned communities are often untagged in OpenStreetMap, so
  // `suburb` may be missing or may just repeat the city name. In either case
  // fall back to the next-best signal and flag it for the agent to confirm.
  const suburbMissing = !suburb || suburb.trim().length === 0;
  const suburbDuplicatesCity = !suburbMissing && normalize(suburb) === normalize(city);
  const neighborhoodNeedsConfirmation = suburbMissing || suburbDuplicatesCity;

  const fallbackGuess =
    result.neighbourhood || result.district || suburb || city || "";

  const neighborhoodGuess = neighborhoodNeedsConfirmation
    ? fallbackGuess
    : (suburb as string);

  return {
    formattedAddress: result.formatted ?? address,
    street: result.street ?? null,
    city,
    state: result.state ?? null,
    zip: result.postcode ?? null,
    lat: result.lat,
    lon: result.lon,
    neighborhoodGuess,
    neighborhoodNeedsConfirmation,
  };
}

interface GeoapifyAutocompleteResponse {
  results?: Array<{
    formatted?: string;
    address_line1?: string;
    address_line2?: string;
  }>;
}

export async function autocompleteAddress(
  text: string
): Promise<AddressSuggestion[]> {
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    throw new GeocodeError(
      "GEOAPIFY_API_KEY is not configured on the server."
    );
  }

  const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
  url.searchParams.set("text", text);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");
  url.searchParams.set("apiKey", apiKey);

  let res: Response;
  try {
    res = await fetch(url.toString());
  } catch {
    throw new GeocodeError("Could not reach the Geoapify autocomplete service.");
  }

  if (!res.ok) {
    throw new GeocodeError(
      `Geoapify autocomplete request failed (status ${res.status}).`
    );
  }

  const data = (await res.json()) as GeoapifyAutocompleteResponse;

  return (data.results ?? [])
    .filter((r): r is { formatted: string; address_line1?: string; address_line2?: string } =>
      Boolean(r.formatted)
    )
    .map((r) => ({
      formatted: r.formatted,
      addressLine1: r.address_line1 ?? null,
      addressLine2: r.address_line2 ?? null,
    }));
}
