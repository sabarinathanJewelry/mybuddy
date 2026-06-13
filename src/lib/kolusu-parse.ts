// Parses staff kolusu sale messages from chat
// Accepted prefixes: "KS" (short) or "kolusu" (long)
// Format: KS <raw_wt> [description] cover <cover_wt> [qty N] [bill XXXX]
// Examples:
//   "KS 34.220 9 B cover 1.100"
//   "KS 57.300 10 inch bomby cover 1.100 qty 2"
//   "kolusu 34.220 9 B cover 1.100"

export interface KolusuChatEntry {
  raw_wt_g: number;
  cover_wt_g: number;
  description: string;
  qty: number;
  bill_no: string;
}

export function parseKolusuChat(text: string): KolusuChatEntry | null {
  const lower = text.trim().toLowerCase();

  let body: string;
  if (lower.startsWith("ks ") || lower === "ks") {
    body = text.trim().slice(2).trim();
  } else if (lower.startsWith("kolusu")) {
    body = text.trim().slice(6).trim();
  } else {
    return null;
  }

  // Must have "cover <number>"
  const coverMatch = body.match(/cover\s+([\d.]+)/i);
  if (!coverMatch) return null;
  const cover_wt_g = parseFloat(coverMatch[1]);

  // First number = raw weight
  const rawMatch = body.match(/^([\d.]+)/);
  if (!rawMatch) return null;
  const raw_wt_g = parseFloat(rawMatch[1]);
  if (!raw_wt_g || !cover_wt_g) return null;

  // Optional qty: "qty 2" or "x2"
  const qtyMatch = body.match(/(?:qty|x)\s*(\d+)/i);
  const qty = qtyMatch ? parseInt(qtyMatch[1]) : 1;

  // Optional bill: "bill 1234" or "bill no 1234"
  const billMatch = body.match(/bill(?:\s*no)?\s+([^\s]+)/i);
  const bill_no = billMatch ? billMatch[1] : "";

  // Description: text between first number and "cover"
  const afterFirst = body.slice(rawMatch[0].length).trim();
  const coverIdx = afterFirst.toLowerCase().indexOf("cover");
  const rawDesc = afterFirst
    .slice(0, coverIdx)
    .replace(/qty\s*\d+|x\s*\d+|bill(?:\s*no)?\s+\S+/gi, "")
    .trim();

  return { raw_wt_g, cover_wt_g, description: rawDesc, qty, bill_no };
}
