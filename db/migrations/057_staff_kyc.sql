-- Migration 057: Staff KYC
-- Stores per-staff KYC submission: Aadhaar last-4, selfie (base64 JPEG),
-- documents physically given to owner, DigiLocker confirmation, and admin status.

CREATE TABLE IF NOT EXISTS staff_kyc (
  id                   uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  bio_user_id          text        NOT NULL REFERENCES staff(bio_user_id) ON DELETE CASCADE,
  aadhaar_last4        text        NOT NULL CHECK (char_length(aadhaar_last4) = 4 AND aadhaar_last4 ~ '^[0-9]{4}$'),
  selfie_data          text,                    -- base64 JPEG data URL (compressed ~30-80 KB)
  digilocker_confirmed boolean     NOT NULL DEFAULT false,
  documents_given      text[]      NOT NULL DEFAULT '{}',
  status               text        NOT NULL DEFAULT 'pending'
                                   CHECK (status IN ('pending','verified','rejected')),
  admin_note           text,
  verified_at          timestamptz,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now(),
  UNIQUE (bio_user_id)
);

ALTER TABLE staff_kyc ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kyc_select" ON staff_kyc FOR SELECT TO authenticated USING (
  coalesce(auth.jwt()->'app_metadata'->>'role','admin') != 'staff'
  OR bio_user_id = coalesce(auth.jwt()->'app_metadata'->>'bio_user_id','')
);
CREATE POLICY "kyc_insert" ON staff_kyc FOR INSERT TO authenticated WITH CHECK (
  bio_user_id = coalesce(auth.jwt()->'app_metadata'->>'bio_user_id','')
  OR coalesce(auth.jwt()->'app_metadata'->>'role','admin') != 'staff'
);
CREATE POLICY "kyc_update" ON staff_kyc FOR UPDATE TO authenticated USING (
  bio_user_id = coalesce(auth.jwt()->'app_metadata'->>'bio_user_id','')
  OR coalesce(auth.jwt()->'app_metadata'->>'role','admin') != 'staff'
);
