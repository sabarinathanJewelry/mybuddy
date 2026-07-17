export interface ConductCategory {
  id: number;
  name: string;
}

export type ConductNoteStatus = "pending" | "fined" | "dismissed";

export interface ConductNote {
  id: string;
  staff_id: string;
  staff_name: string | null;
  category_id: number | null;
  note: string | null;
  note_date: string;
  noted_by: string | null;
  noted_by_name: string | null;
  status: ConductNoteStatus;
  fine_amount: number | null;
  resolved_by: string | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface StaffOption {
  id: string;
  name: string;
  designation: string | null;
}
