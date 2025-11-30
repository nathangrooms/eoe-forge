-- Create enum for task priority
CREATE TYPE public.task_priority AS ENUM ('high', 'medium', 'low');

-- Add priority column to tasks table
ALTER TABLE public.tasks
ADD COLUMN priority task_priority NOT NULL DEFAULT 'medium';