import { NextResponse } from "next/server";

const MONTH_MAP: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

function parseDate(s: string): string | null {
  const m = s.match(/([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{4})/);
  if (!m) return null;
  const mon = MONTH_MAP[m[1]];
  if (!mon) return null;
  return `${m[3]}-${mon}-${m[2].padStart(2, "0")}`;
}

function parseRate(s: string): number {
  const m = s.match(/[\d,]{4,}/);
  if (!m) return 0;
  return parseInt(m[0].replace(/,/g, ""), 10);
}

export async function GET() {
  try {
    const res = await fetch("https://www.goodreturns.in/gold-rates/madurai.html", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      cache: "no-store",
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const rates: { date: string; gold_24k: number; gold_22k: number }[] = [];
    const seen = new Set<string>();

    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    while ((trMatch = trRegex.exec(html)) !== null) {
      const rowHtml = trMatch[1];
      const tds: string[] = [];
      const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let tdMatch;
      while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
        const text = tdMatch[1]
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        tds.push(text);
      }

      if (tds.length >= 3) {
        const date = parseDate(tds[0]);
        const r24 = parseRate(tds[1]);
        const r22 = parseRate(tds[2]);
        if (date && !seen.has(date) && r24 > 5000 && r22 > 5000) {
          seen.add(date);
          rates.push({ date, gold_24k: r24, gold_22k: r22 });
        }
      }
    }

    // Extract silver ₹/kg → per gram
    const silverMatch = html.match(/(?:₹|Rs\.?)\s*([\d,]+)\s*\/\s*[Kk][Gg]/);
    const silverPerGram = silverMatch
      ? Math.round(parseInt(silverMatch[1].replace(/,/g, ""), 10) / 1000)
      : 0;

    return NextResponse.json({
      rates: rates.slice(0, 10),
      silverPerGram,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to fetch market rates";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
