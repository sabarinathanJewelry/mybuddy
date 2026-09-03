export interface ConductChatCode {
  code: string;
  label: string;
  categoryName: string;
  points: number;
}

export interface ConductChatEntry {
  staffName: string;
  code: string;
  note: string;
}

// Format: CD <StaffName> <CODE> [note]
// For multi-word names use quotes: CD "Mary John" SC note here
// Codes are admin-configurable (conduct_chat_codes table).
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

  // Accept any 2-5 uppercase letter code
  const codeMatch = rest.match(/^([A-Za-z]{2,5})(?:\s|$)/);
  if (!codeMatch) return null;
  const code = codeMatch[1].toUpperCase();
  const note = rest.slice(codeMatch[0].length).trim();

  return { staffName, code, note };
}
