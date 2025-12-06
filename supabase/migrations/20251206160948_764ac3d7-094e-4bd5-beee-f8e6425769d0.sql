-- Add policy for admins to read all user subscriptions (SELECT only for stats)
CREATE POLICY "Admins can read all subscriptions"
ON public.user_subscriptions FOR SELECT
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));