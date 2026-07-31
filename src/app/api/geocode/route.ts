import { NextResponse } from "next/server";
import { geocodeAddress, GeocodeError } from "@/lib/geoapify";

export async function POST(request: Request) {
  let body: { address?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const address = typeof body.address === "string" ? body.address.trim() : "";
  if (!address) {
    return NextResponse.json({ error: "Address is required." }, { status: 400 });
  }

  try {
    const result = await geocodeAddress(address);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof GeocodeError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("Unexpected geocoding error:", err);
    return NextResponse.json(
      { error: "Something went wrong while looking up that address." },
      { status: 500 }
    );
  }
}
