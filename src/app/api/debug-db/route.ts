import { NextResponse } from "next/server";

export async function GET() {
  const report: Record<string, unknown> = {
    nodeVersion: process.version,
    hasUrl: Boolean(process.env.TURSO_DATABASE_URL),
    hasToken: Boolean(process.env.TURSO_AUTH_TOKEN),
  };

  try {
    const mod = await import("@libsql/client/web");
    report.importOk = true;
    report.hasCreateClient = typeof mod.createClient === "function";

    const client = mod.createClient({
      url: process.env.TURSO_DATABASE_URL ?? "",
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    report.clientCreated = true;

    const result = await client.execute("SELECT 1 as ok");
    report.queryOk = true;
    report.rows = result.rows;
  } catch (err) {
    report.caught = true;
    if (err instanceof Error) {
      report.errorName = err.name;
      report.errorMessage = err.message;
      report.errorStack = err.stack;
      report.errorCause = err.cause ? String(err.cause) : null;
    } else {
      report.rawError = String(err);
    }
  }

  return NextResponse.json(report);
}
