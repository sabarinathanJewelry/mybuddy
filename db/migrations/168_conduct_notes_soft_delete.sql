-- 168: Soft-delete for conduct notes.
-- Admin can delete a note/fine; it stays visible to the staff as an audit trail
-- with a "deleted by admin" label instead of being permanently removed.

alter table conduct_notes
  add column if not exists deleted_at     timestamptz,
  add column if not exists deleted_by_name text;
