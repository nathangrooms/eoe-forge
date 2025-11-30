-- Create enum for task category
CREATE TYPE public.task_category AS ENUM ('feature', 'bug', 'improvement', 'core_functionality');

-- Add category column to tasks table
ALTER TABLE public.tasks
ADD COLUMN category task_category NOT NULL DEFAULT 'feature';