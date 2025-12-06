-- Create subscription tier enum
CREATE TYPE public.subscription_tier AS ENUM ('free', 'pro', 'unlimited');

-- Create feature flags table (admin-controlled)
CREATE TABLE public.feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    enabled BOOLEAN NOT NULL DEFAULT false,
    requires_tier subscription_tier DEFAULT 'free',
    is_experimental BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create subscription limits table (defines limits per tier)
CREATE TABLE public.subscription_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tier subscription_tier NOT NULL,
    feature_key TEXT NOT NULL,
    limit_value INTEGER NOT NULL,
    limit_type TEXT NOT NULL DEFAULT 'monthly', -- monthly, daily, total
    description TEXT,
    UNIQUE(tier, feature_key)
);

-- Create user subscriptions table
CREATE TABLE public.user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    tier subscription_tier NOT NULL DEFAULT 'free',
    started_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    stripe_subscription_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create feature usage tracking table
CREATE TABLE public.feature_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    feature_key TEXT NOT NULL,
    usage_count INTEGER DEFAULT 0,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, feature_key, period_start)
);

-- Enable RLS
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_usage ENABLE ROW LEVEL SECURITY;

-- Feature flags: publicly readable, admin-writable
CREATE POLICY "Feature flags are publicly readable"
ON public.feature_flags FOR SELECT
USING (true);

CREATE POLICY "Admins can manage feature flags"
ON public.feature_flags FOR ALL
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- Subscription limits: publicly readable
CREATE POLICY "Subscription limits are publicly readable"
ON public.subscription_limits FOR SELECT
USING (true);

CREATE POLICY "Admins can manage subscription limits"
ON public.subscription_limits FOR ALL
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- User subscriptions: users can view own, admins can manage all
CREATE POLICY "Users can view their own subscription"
ON public.user_subscriptions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all subscriptions"
ON public.user_subscriptions FOR ALL
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- Feature usage: users can manage their own
CREATE POLICY "Users can manage their own feature usage"
ON public.feature_usage FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all feature usage"
ON public.feature_usage FOR SELECT
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- Insert default feature flags
INSERT INTO public.feature_flags (key, name, description, enabled, requires_tier, is_experimental) VALUES
('ai_deck_builder', 'AI Deck Builder', 'AI-powered deck building assistance', true, 'free', false),
('ai_deck_coach', 'AI Deck Coach', 'Real-time AI coaching for deck improvements', true, 'pro', false),
('ai_card_scanner', 'AI Card Scanner', 'Camera-based card recognition', true, 'free', false),
('deck_simulation', 'Deck Simulation', 'Test play decks against AI', true, 'pro', false),
('advanced_analytics', 'Advanced Analytics', 'Detailed collection and deck analytics', true, 'pro', false),
('bulk_operations', 'Bulk Operations', 'Bulk edit cards and collections', true, 'free', false),
('marketplace', 'Marketplace', 'Buy and sell cards', true, 'free', false),
('price_alerts', 'Price Alerts', 'Get notified on price changes', true, 'pro', false),
('deck_sharing', 'Deck Sharing', 'Share decks publicly', true, 'free', false),
('tournament_manager', 'Tournament Manager', 'Create and manage tournaments', true, 'pro', false),
('collection_backup', 'Collection Backup', 'Backup and restore collections', true, 'pro', false),
('deck_export', 'Deck Export', 'Export decks in multiple formats', true, 'free', false),
('storage_management', 'Storage Management', 'Physical card storage tracking', true, 'pro', false),
('mtg_brain', 'MTG Brain', 'AI card database and insights', true, 'free', false),
('social_features', 'Social Features', 'Follow users and like decks', false, 'pro', true),
('tcgplayer_sync', 'TCGPlayer Sync', 'Sync prices from TCGPlayer', false, 'unlimited', true),
('api_access', 'API Access', 'External API access', false, 'unlimited', true);

-- Insert subscription limits
-- Free tier limits
INSERT INTO public.subscription_limits (tier, feature_key, limit_value, limit_type, description) VALUES
('free', 'ai_deck_builds', 5, 'monthly', 'AI deck builds per month'),
('free', 'ai_coach_queries', 10, 'monthly', 'AI coaching queries per month'),
('free', 'card_scans', 50, 'monthly', 'Card scans per month'),
('free', 'decks', 10, 'total', 'Total decks'),
('free', 'collection_cards', 1000, 'total', 'Cards in collection'),
('free', 'price_alerts', 5, 'total', 'Active price alerts'),
('free', 'marketplace_listings', 10, 'total', 'Active marketplace listings'),
('free', 'storage_containers', 3, 'total', 'Storage containers'),
('free', 'deck_exports', 10, 'monthly', 'Deck exports per month');

-- Pro tier limits
INSERT INTO public.subscription_limits (tier, feature_key, limit_value, limit_type, description) VALUES
('pro', 'ai_deck_builds', 50, 'monthly', 'AI deck builds per month'),
('pro', 'ai_coach_queries', 200, 'monthly', 'AI coaching queries per month'),
('pro', 'card_scans', 500, 'monthly', 'Card scans per month'),
('pro', 'decks', 100, 'total', 'Total decks'),
('pro', 'collection_cards', 50000, 'total', 'Cards in collection'),
('pro', 'price_alerts', 50, 'total', 'Active price alerts'),
('pro', 'marketplace_listings', 100, 'total', 'Active marketplace listings'),
('pro', 'storage_containers', 50, 'total', 'Storage containers'),
('pro', 'deck_exports', 100, 'monthly', 'Deck exports per month');

-- Unlimited tier (use -1 for unlimited)
INSERT INTO public.subscription_limits (tier, feature_key, limit_value, limit_type, description) VALUES
('unlimited', 'ai_deck_builds', -1, 'monthly', 'Unlimited AI deck builds'),
('unlimited', 'ai_coach_queries', -1, 'monthly', 'Unlimited AI coaching'),
('unlimited', 'card_scans', -1, 'monthly', 'Unlimited card scans'),
('unlimited', 'decks', -1, 'total', 'Unlimited decks'),
('unlimited', 'collection_cards', -1, 'total', 'Unlimited collection'),
('unlimited', 'price_alerts', -1, 'total', 'Unlimited price alerts'),
('unlimited', 'marketplace_listings', -1, 'total', 'Unlimited listings'),
('unlimited', 'storage_containers', -1, 'total', 'Unlimited storage'),
('unlimited', 'deck_exports', -1, 'monthly', 'Unlimited exports');

-- Create function to check feature access
CREATE OR REPLACE FUNCTION public.check_feature_access(
    _user_id UUID,
    _feature_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    is_admin BOOLEAN;
    user_tier subscription_tier;
    feature_record RECORD;
    limit_record RECORD;
    usage_record RECORD;
    current_usage INTEGER;
    result JSONB;
BEGIN
    -- Check if user is admin (admins always have access)
    SELECT p.is_admin INTO is_admin FROM profiles p WHERE p.id = _user_id;
    IF is_admin = true THEN
        RETURN jsonb_build_object(
            'allowed', true,
            'is_admin', true,
            'limit', -1,
            'used', 0,
            'remaining', -1
        );
    END IF;
    
    -- Get user's subscription tier (default to free)
    SELECT us.tier INTO user_tier 
    FROM user_subscriptions us 
    WHERE us.user_id = _user_id AND us.is_active = true;
    
    IF user_tier IS NULL THEN
        user_tier := 'free';
    END IF;
    
    -- Check if feature is enabled and user has required tier
    SELECT * INTO feature_record FROM feature_flags ff WHERE ff.key = _feature_key;
    
    IF feature_record IS NULL OR NOT feature_record.enabled THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'feature_disabled',
            'tier', user_tier::text
        );
    END IF;
    
    -- Check tier requirement
    IF feature_record.requires_tier = 'unlimited' AND user_tier != 'unlimited' THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'tier_required',
            'required_tier', 'unlimited',
            'current_tier', user_tier::text
        );
    END IF;
    
    IF feature_record.requires_tier = 'pro' AND user_tier = 'free' THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'tier_required',
            'required_tier', 'pro',
            'current_tier', user_tier::text
        );
    END IF;
    
    -- Get limit for this feature and tier
    SELECT * INTO limit_record 
    FROM subscription_limits sl 
    WHERE sl.tier = user_tier AND sl.feature_key = _feature_key;
    
    IF limit_record IS NULL THEN
        -- No limit defined, allow access
        RETURN jsonb_build_object(
            'allowed', true,
            'limit', -1,
            'used', 0,
            'remaining', -1,
            'tier', user_tier::text
        );
    END IF;
    
    -- Unlimited access (-1)
    IF limit_record.limit_value = -1 THEN
        RETURN jsonb_build_object(
            'allowed', true,
            'limit', -1,
            'used', 0,
            'remaining', -1,
            'tier', user_tier::text
        );
    END IF;
    
    -- Get current usage
    IF limit_record.limit_type = 'monthly' THEN
        SELECT fu.usage_count INTO current_usage
        FROM feature_usage fu
        WHERE fu.user_id = _user_id 
          AND fu.feature_key = _feature_key
          AND fu.period_start <= now()
          AND fu.period_end > now();
    ELSE
        SELECT COALESCE(SUM(fu.usage_count), 0) INTO current_usage
        FROM feature_usage fu
        WHERE fu.user_id = _user_id AND fu.feature_key = _feature_key;
    END IF;
    
    current_usage := COALESCE(current_usage, 0);
    
    RETURN jsonb_build_object(
        'allowed', current_usage < limit_record.limit_value,
        'limit', limit_record.limit_value,
        'used', current_usage,
        'remaining', GREATEST(0, limit_record.limit_value - current_usage),
        'tier', user_tier::text,
        'limit_type', limit_record.limit_type
    );
END;
$$;

-- Create function to increment feature usage
CREATE OR REPLACE FUNCTION public.increment_feature_usage(
    _user_id UUID,
    _feature_key TEXT,
    _amount INTEGER DEFAULT 1
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    period_start_date TIMESTAMPTZ;
    period_end_date TIMESTAMPTZ;
BEGIN
    -- Calculate current month period
    period_start_date := date_trunc('month', now());
    period_end_date := date_trunc('month', now()) + interval '1 month';
    
    -- Upsert usage record
    INSERT INTO feature_usage (user_id, feature_key, usage_count, period_start, period_end)
    VALUES (_user_id, _feature_key, _amount, period_start_date, period_end_date)
    ON CONFLICT (user_id, feature_key, period_start)
    DO UPDATE SET 
        usage_count = feature_usage.usage_count + _amount,
        updated_at = now();
    
    RETURN true;
END;
$$;

-- Trigger for updated_at
CREATE TRIGGER update_feature_flags_updated_at
BEFORE UPDATE ON public.feature_flags
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_subscriptions_updated_at
BEFORE UPDATE ON public.user_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_feature_usage_updated_at
BEFORE UPDATE ON public.feature_usage
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();