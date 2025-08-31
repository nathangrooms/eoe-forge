-- Add step tracking columns to sync_status table
ALTER TABLE public.sync_status 
ADD COLUMN IF NOT EXISTS current_step TEXT,
ADD COLUMN IF NOT EXISTS step_progress INTEGER DEFAULT 0;