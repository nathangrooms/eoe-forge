-- Set the admin user to have admin privileges
UPDATE profiles 
SET is_admin = true 
WHERE username = 'admin';