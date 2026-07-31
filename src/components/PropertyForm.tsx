"use client";

import { useState, type FormEvent } from "react";
import {
  TONES,
  type Tone,
  type GeocodeResult,
  type GenerateResponseBody,
} from "@/lib/types";
import ResultsDisplay from "@/components/ResultsDisplay";
import AddressAutocompleteInput from "@/components/AddressAutocompleteInput";

type Step = "form" | "confirm" | "loading" | "results";

interface LoadingState {
  headline: string;
  detail: string;
}

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 100; // ~5 minutes

export default function PropertyForm() {
  const [step, setStep] = useState<Step>("form");
  const [loading, setLoading] = useState<LoadingState>({
    headline: "",
    detail: "",
  });
  const [error, setError] = useState<string | null>(null);

  const [address, setAddress] = useState("");
  const [facts, setFacts] = useState("");
  const [tone, setTone] = useState<Tone>("Balanced");
  const [communityName, setCommunityName] = useState("");

  const [geocode, setGeocode] = useState<GeocodeResult | null>(null);
  const [neighborhood, setNeighborhood] = useState("");
  const [results, setResults] = useState<GenerateResponseBody | null>(null);

  async function handleSubmitForm(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!address.trim() || !facts.trim()) {
      setError("An address and a few key facts are required to get started.");
      return;
    }

    setStep("loading");
    setLoading({
      headline: "Pinning down the address...",
      detail: "Confirming the exact location so nothing gets mixed up.",
    });

    try {
      const res = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to look up address.");
      }

      const result = data as GeocodeResult;
      setGeocode(result);

      const providedNeighborhood = communityName.trim();
      if (providedNeighborhood) {
        // Agent already told us the community name — trust it and skip the
        // guess-and-confirm step entirely.
        setNeighborhood(providedNeighborhood);
        await runGenerationPipeline(result, providedNeighborhood);
      } else {
        setNeighborhood(result.neighborhoodGuess);
        if (result.neighborhoodNeedsConfirmation) {
          setStep("confirm");
        } else {
          await runGenerationPipeline(result, result.neighborhoodGuess);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStep("form");
    }
  }

  async function handleConfirmNeighborhood(e: FormEvent) {
    e.preventDefault();
    if (!neighborhood.trim()) {
      setError("Please enter a neighborhood name.");
      return;
    }
    if (!geocode) return;
    setError(null);
    await runGenerationPipeline(geocode, neighborhood.trim());
  }

  async function runGenerationPipeline(
    resolvedGeocode: GeocodeResult,
    confirmedNeighborhood: string
  ) {
    setStep("loading");
    setError(null);

    try {
      setLoading({
        headline: "Getting to know the neighborhood...",
        detail:
          "Searching real sources for schools, parks, and what makes this area special — never copying other listings.",
      });
      const startRes = await fetch("/api/neighborhood/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          neighborhood: confirmedNeighborhood,
          city: resolvedGeocode.city ?? "",
          state: resolvedGeocode.state ?? "",
          zip: resolvedGeocode.zip ?? "",
        }),
      });
      const startData = await startRes.json();
      if (!startRes.ok) {
        throw new Error(startData.error ?? "Failed to start neighborhood research.");
      }

      const neighborhoodProfile: string =
        startData.status === "done"
          ? startData.profile
          : await pollForResearchResult(startData.jobId as string);

      setLoading({
        headline: "Writing your listing...",
        detail:
          "Blending the property facts with the neighborhood story into copy that's ready to publish.",
      });
      const generateRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: resolvedGeocode.formattedAddress,
          facts,
          tone,
          neighborhood: confirmedNeighborhood,
          city: resolvedGeocode.city ?? "",
          zip: resolvedGeocode.zip ?? "",
          neighborhoodProfile,
        }),
      });
      const generateData = await generateRes.json();
      if (!generateRes.ok) {
        throw new Error(generateData.error ?? "Failed to generate the description.");
      }

      setResults(generateData as GenerateResponseBody);
      setStep("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStep(geocode?.neighborhoodNeedsConfirmation ? "confirm" : "form");
    }
  }

  async function pollForResearchResult(jobId: string): Promise<string> {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      if (attempt === 10) {
        setLoading({
          headline: "Still researching...",
          detail:
            "Newer or less-documented areas can take a couple of minutes. Hang tight.",
        });
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const statusRes = await fetch(
        `/api/neighborhood/status?jobId=${encodeURIComponent(jobId)}`
      );
      const statusData = await statusRes.json();
      if (!statusRes.ok) {
        throw new Error(statusData.error ?? "Failed to check research status.");
      }

      if (statusData.status === "done") {
        return statusData.profile as string;
      }
      if (statusData.status === "error") {
        throw new Error(statusData.errorMessage ?? "Neighborhood research failed.");
      }
    }

    throw new Error(
      "Neighborhood research is taking longer than expected. Please try again."
    );
  }

  function handleStartOver() {
    setStep("form");
    setGeocode(null);
    setNeighborhood("");
    setError(null);
    setAddress("");
    setFacts("");
    setTone("Balanced");
    setCommunityName("");
    setResults(null);
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {step === "form" && (
        <form onSubmit={handleSubmitForm} className="space-y-6">
          <Field
            label="Property address"
            required
            hint="Start typing and pick your listing from the suggestions."
          >
            <AddressAutocompleteInput
              value={address}
              onChange={setAddress}
              placeholder="123 Main St, Jacksonville, FL 32259"
              className={inputClass}
            />
          </Field>

          <Field
            label="Key facts"
            required
            hint="Tell us what buyers will love about this home."
          >
            <textarea
              value={facts}
              onChange={(e) => setFacts(e.target.value)}
              rows={6}
              placeholder="4 bed / 3 bath, 2,650 sqft, built 2019, updated kitchen with quartz counters, screened lanai, 3-car garage..."
              className={inputClass}
            />
          </Field>

          <Field
            label="Tone"
            hint="Sets the writing style — e.g. upscale for Luxury, numbers-focused for Investor. Balanced works for most listings."
          >
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value as Tone)}
              className={inputClass}
            >
              {TONES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Neighborhood / community name"
            hint="Optional — skips a confirmation step if you already know it."
          >
            <input
              type="text"
              value={communityName}
              onChange={(e) => setCommunityName(e.target.value)}
              className={inputClass}
            />
          </Field>

          <button type="submit" className={buttonClass}>
            Write my listing
          </button>
        </form>
      )}

      {step === "loading" && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-green/25 border-t-brand-green" />
          <p className="text-sm font-medium text-brand-ink">{loading.headline}</p>
          <p className="max-w-sm text-xs text-neutral-500">{loading.detail}</p>
        </div>
      )}

      {step === "confirm" && geocode && (
        <form onSubmit={handleConfirmNeighborhood} className="space-y-6">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            This address sits in a newer or less-mapped area, so we
            couldn&apos;t pin down the neighborhood or community name with
            confidence. Take a look below and adjust it if needed.
          </div>

          <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
            {geocode.formattedAddress}
          </div>

          <Field label="Neighborhood / community name" required>
            <input
              type="text"
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              className={inputClass}
              autoFocus
            />
          </Field>

          <div className="flex gap-3">
            <button type="submit" className={buttonClass}>
              Confirm and write my listing
            </button>
            <button
              type="button"
              onClick={handleStartOver}
              className="rounded-md px-4 py-2 text-sm font-medium text-neutral-600 hover:text-brand-ink"
            >
              Start over
            </button>
          </div>
        </form>
      )}

      {step === "results" && results && (
        <ResultsDisplay results={results} onStartOver={handleStartOver} />
      )}
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm placeholder:text-neutral-400 focus:border-brand-green focus:outline-none focus:ring-1 focus:ring-brand-green";

const buttonClass =
  "rounded-md bg-brand-green px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-green-deep focus:outline-none focus:ring-2 focus:ring-brand-green focus:ring-offset-2";

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-brand-ink">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {hint && <span className="mt-0.5 block text-xs text-neutral-500">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
