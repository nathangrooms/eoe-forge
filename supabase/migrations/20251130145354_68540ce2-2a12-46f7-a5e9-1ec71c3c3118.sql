-- Add service role policy for task updates
CREATE POLICY "Service role can manage tasks"
ON tasks
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Mark completed tasks as done
UPDATE tasks 
SET status = 'done', updated_at = now()
WHERE id IN (
  '1c79c1b1-6315-4a66-b3e9-b02bd98b0c70',
  '41da0737-87cf-4f0c-9d5e-ae7db26fdbd9',
  '4c95fc9e-93b6-45c7-b72c-656e6edec86c',
  'c8f7120c-f26c-432c-b604-13c5c2849bc3',
  '281f80bd-1b9e-4325-9f4e-5a94fb25b1f9',
  '434b65d3-a507-46fb-91de-8d09968dbecf'
);