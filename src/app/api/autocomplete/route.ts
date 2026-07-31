import { NextResponse } from "next/server";
import { autocompleteAddress, GeocodeError } from "@/lib/geoapify";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const text = (searchParams.get("text") ?? "").trim();

  if (text.length < 3) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    const suggestions = await autocompleteAddress(text);
    return NextResponse.json({ suggestions });
  } catch (err) {
    if (err instanceof GeocodeError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("Unexpected autocomplete error:", err);
    return NextResponse.json(
      { error: "Something went wrong while fetching address suggestions." },
      { status: 500 }
    );
  }
}
