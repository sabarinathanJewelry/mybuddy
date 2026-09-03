export const CONDUCT_CODES = {
  SH: { label: "Shouting",              categoryName: "Other" },
  SC: { label: "Shouting at customer",  categoryName: "Customer Handling" },
  BW: { label: "Bad words/language",    categoryName: "Other" },
  BT: { label: "Beating/altercation",   categoryName: "Other" },
  LC: { label: "Laughing at customer",  categoryName: "Customer Handling" },
} as const;

export type ConductCode = keyof typeof CONDUCT_CODES;

export interface ConductChatEntry {
  staffName: string;
  code: ConductCode;
  note: string;
}

// Format: CD <StaffName> <CODE> [note]
// For multi-word names use quotes: CD "Mary John" SC note here
// Codes: SH SC BW BT LC
export function parseConductChat(text: string): ConductChatEntry | null {
  const lower = text.trim().toLowerCase();
  if (!lower.startsWith("cd ")) return null;

  const body = text.trim().slice(3).trim();
  if (!body) return null;

  let staffName: string;
  let rest: string;

  if (body.startsWith('"')) {
    const closeQ = body.indexOf('"', 1);
    if (closeQ === -1) return null;
    staffName = body.slice(1, closeQ).trim();
    rest = body.slice(closeQ + 1).trim();
  } else {
    const spaceIdx = body.search(/\s/);
    if (spaceIdx === -1) return null;
    staffName = body.slice(0, spaceIdx);
    rest = body.slice(spaceIdx + 1).trim();
  }

  if (!staffName) return null;

  const codeMatch = rest.match(/^([A-Za-z]{2,4})(?:\s|$)/);
  if (!codeMatch) return null;
  const code = codeMatch[1].toUpperCase() as ConductCode;
  if (!(code in CONDUCT_CODES)) return null;

  const note = rest.slice(codeMatch[0].length).trim();
  return { staffName, code, note };
}
