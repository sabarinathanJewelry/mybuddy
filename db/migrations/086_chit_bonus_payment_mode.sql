-- Migration 086: Add chit_bonus to payment_mode enum
ALTER TYPE payment_mode ADD VALUE IF NOT EXISTS 'chit_bonus';
