export interface KolusuChatEntry {
  raw_wt_g: number;
  cover_wt_g: number;
  description: string;
  qty: number;
  bill_no: string;
}

// Accepted formats (prefix: KS or kolusu):
//   KS <kolusu_wt> <description> <cover_wt>        ← positional (last number = cover)
//   KS <kolusu_wt> <description> cover <cover_wt>   ← explicit keyword
// Examples:
//   KS 33.5 9.5 M 1.1
//   KS 33.5 11 1.1
//   KS 34.220 10 inch bomby cover 1.100
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

  // First number = kolusu weight
  const rawMatch = body.match(/^([\d.]+)/);
  if (!rawMatch) return null;
  const raw_wt_g = parseFloat(rawMatch[1]);
  if (!raw_wt_g) return null;

  const afterFirst = body.slice(rawMatch[0].length).trim();

  // Optional: qty "qty 2" or "x2"
  const qtyMatch = afterFirst.match(/(?:qty|x)\s*(\d+)/i);
  const qty = qtyMatch ? parseInt(qtyMatch[1]) : 1;

  // Optional: bill "bill 1234"
  const billMatch = afterFirst.match(/bill(?:\s*no)?\s+([^\s]+)/i);
  const bill_no = billMatch ? billMatch[1] : "";

  // Cover weight — two ways:
  // 1. Explicit "cover <n>"
  const coverKeyMatch = afterFirst.match(/cover\s+([\d.]+)/i);
  if (coverKeyMatch) {
    const cover_wt_g = parseFloat(coverKeyMatch[1]);
    if (!cover_wt_g) return null;
    const coverIdx = afterFirst.toLowerCase().indexOf("cover");
    const rawDesc = afterFirst
      .slice(0, coverIdx)
      .replace(/qty\s*\d+|x\s*\d+|bill(?:\s*no)?\s+\S+/gi, "")
      .trim();
    return { raw_wt_g, cover_wt_g, description: rawDesc, qty, bill_no };
  }

  // 2. Positional — last standalone number is cover weight
  const numbers = [...afterFirst.matchAll(/\b([\d]+\.[\d]+|[\d]+)\b/g)];
  if (numbers.length === 0) return null;
  const lastNum = numbers[numbers.length - 1];
  const cover_wt_g = parseFloat(lastNum[1]);
  if (!cover_wt_g) return null;

  const descRaw = afterFirst
    .slice(0, lastNum.index)
    .replace(/qty\s*\d+|x\s*\d+|bill(?:\s*no)?\s+\S+/gi, "")
    .trim();

  return { raw_wt_g, cover_wt_g, description: descRaw, qty, bill_no };
}
