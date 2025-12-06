-- Add AI Optimizer feature flag
INSERT INTO public.feature_flags (key, name, description, enabled, is_experimental)
VALUES (
  'ai_deck_optimizer',
  'AI Deck Optimizer',
  'AI-powered deck optimization with card replacement suggestions',
  false,
  true
)
ON CONFLICT (key) DO UPDATE SET
  enabled = false,
  is_experimental = true,
  updated_at = now();