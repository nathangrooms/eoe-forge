-- First, check if we need to create profiles for existing users
INSERT INTO profiles (id, username, is_admin)
SELECT 
  auth.users.id,
  COALESCE(auth.users.raw_user_meta_data->>'username', split_part(auth.users.email, '@', 1)) as username,
  true as is_admin
FROM auth.users 
WHERE NOT EXISTS (
  SELECT 1 FROM profiles WHERE profiles.id = auth.users.id
)
ON CONFLICT (id) DO UPDATE SET is_admin = true;

-- Update sync_status policies to allow service role operations
DROP POLICY IF EXISTS "Admins can update sync status" ON sync_status;

-- Create more permissive policy for sync operations
CREATE POLICY "Service role can manage sync status" 
ON sync_status 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Also create admin policy for dashboard management
CREATE POLICY "Admins can manage sync status" 
ON sync_status 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() AND profiles.is_admin = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() AND profiles.is_admin = true
  )
);