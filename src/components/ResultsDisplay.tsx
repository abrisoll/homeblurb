"use client";

import { useState } from "react";
import type { GenerateResponseBody } from "@/lib/types";

export default function ResultsDisplay({
  results,
  onStartOver,
}: {
  results: GenerateResponseBody;
  onStartOver: () => void;
}) {
  return (
    <div className="space-y-6">
      <ResultCard
        title="MLS description"
        subtitle="Concise and compliant — paste straight into the MLS. It'll syndicate out to Zillow, Realtor.com, and the rest from there."
        text={results.mls}
      />
      <ResultCard
        title="Web / listing description"
        subtitle="The extended story — great for your own website, email blasts, or anywhere you want more detail than the MLS format allows."
        text={results.web}
      />
      <ResultCard
        title="Social caption"
        subtitle="Ready-to-use copy for when you post your photos and videos to social media."
        text={results.social}
      />

      <button
        type="button"
        onClick={onStartOver}
        className="rounded-md px-4 py-2 text-sm font-medium text-neutral-600 hover:text-brand-ink"
      >
        Start a new listing
      </button>
    </div>
  );
}

function ResultCard({
  title,
  subtitle,
  text,
}: {
  title: string;
  subtitle: string;
  text: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-brand-ink">{title}</h2>
          <p className="text-xs text-neutral-500">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:border-brand-green hover:text-brand-green-deep"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <p className="whitespace-pre-wrap px-4 py-4 text-sm leading-relaxed text-neutral-800">
        {text}
      </p>
    </div>
  );
}
