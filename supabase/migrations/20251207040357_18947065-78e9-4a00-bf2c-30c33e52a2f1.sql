-- Add testing banner feature flag
INSERT INTO feature_flags (key, name, description, enabled, requires_tier, is_experimental)
VALUES (
  'show_testing_banner',
  'Show Testing Banner',
  'When enabled, shows a simplified testing/feedback banner instead of the full homepage',
  true,
  null,
  false
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;