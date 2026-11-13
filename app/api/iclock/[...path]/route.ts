import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// eSSL/ZKTeco ADMS push protocol. Device → punch.sabarinathan.com (Cloudflare Worker, HTTP) → here.
// Device clock is IST with no zone in the payload.

function text(body: string, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/plain" } });
}

function authorized(req: NextRequest) {
  const key = process.env.ESSL_RELAY_KEY;
  return !!key && req.headers.get("x-relay-key") === key;
}

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function markSeen(sn: string) {
  await db().from("app_settings").upsert(
    [{ key: "last_sync_at", value: new Date().toISOString() }, { key: "essl_push_sn", value: sn }],
    { onConflict: "key" },
  );
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  if (!authorized(req)) return text("Unauthorized", 401);
  const { path } = await params;
  const sn = req.nextUrl.searchParams.get("SN") ?? "";
  const route = path.join("/");

  if (route === "cdata") {
    await markSeen(sn);
    return text([
      `GET OPTION FROM: ${sn}`,
      "ATTLOGStamp=None",
      "OPERLOGStamp=9999",
      "ATTPHOTOStamp=None",
      "ErrorDelay=30",
      "Delay=10",
      "TransTimes=00:00;14:05",
      "TransInterval=1",
      "TransFlag=TransData AttLog",
      "TimeZone=5.5",
      "Realtime=1",
      "Encrypt=None",
    ].join("\n") + "\n");
  }
  return text("OK");
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  if (!authorized(req)) return text("Unauthorized", 401);
  const { path } = await params;
  const sp = req.nextUrl.searchParams;
  const body = await req.text();

  if (path.join("/") !== "cdata" || sp.get("table") !== "ATTLOG") return text("OK");

  const rows = body
    .split(/\r?\n/)
    .map((l) => l.split("\t"))
    .filter((f) => f[0]?.trim() && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(f[1]?.trim() ?? ""))
    .map((f) => ({
      bio_user_id: f[0].trim(),
      punch_time: new Date(f[1].trim().replace(" ", "T") + "+05:30").toISOString(),
      punch_status: f[2] !== undefined && f[2] !== "" ? parseInt(f[2]) : null,
      punch_type: f[3] !== undefined && f[3] !== "" ? parseInt(f[3]) : null,
    }));

  const client = db();
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await client
      .from("attendance_logs")
      .upsert(rows.slice(i, i + 500), { onConflict: "bio_user_id,punch_time" });
    if (error) return text(`ERROR: ${error.message}`, 500);
  }
  await markSeen(sp.get("SN") ?? "");
  return text(`OK: ${rows.length}`);
}
