-- Per-staff flag: whether OT minutes offset late fine calculation
alter table staff add column if not exists equalize_ot boolean not null default false;
