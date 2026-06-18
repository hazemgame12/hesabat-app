-- Phase 1: Bank Movement ↔ Payment ↔ Invoice linking
-- Add bankMovementId FK to payments
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS bank_movement_id uuid REFERENCES bank_movements(id) ON DELETE SET NULL;

-- Add multi-currency tracking fields to payment_allocations
ALTER TABLE payment_allocations
  ADD COLUMN IF NOT EXISTS allocated_currency text,
  ADD COLUMN IF NOT EXISTS base_currency_amount numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(18,6) NOT NULL DEFAULT 1;
