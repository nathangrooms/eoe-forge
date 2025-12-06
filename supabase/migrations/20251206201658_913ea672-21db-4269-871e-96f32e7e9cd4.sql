-- Schedule daily price capture at 6 AM UTC
SELECT cron.schedule(
  'daily-price-capture',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://udnaflcohfyljrsgqggy.supabase.co/functions/v1/daily-price-capture',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);