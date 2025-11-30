-- Add app_section column to tasks table
ALTER TABLE tasks ADD COLUMN app_section TEXT;

-- Update existing tasks with app sections based on their titles/descriptions
UPDATE tasks SET app_section = 'dashboard' 
WHERE title ILIKE '%dashboard%' OR description ILIKE '%dashboard%';

UPDATE tasks SET app_section = 'collection' 
WHERE title ILIKE '%collection%' OR description ILIKE '%collection%';

UPDATE tasks SET app_section = 'deck_builder' 
WHERE title ILIKE '%deck%' OR description ILIKE '%deck%' OR title ILIKE '%builder%';

UPDATE tasks SET app_section = 'marketplace' 
WHERE title ILIKE '%marketplace%' OR description ILIKE '%marketplace%' OR title ILIKE '%listing%' OR title ILIKE '%sell%';

UPDATE tasks SET app_section = 'wishlist' 
WHERE title ILIKE '%wishlist%' OR description ILIKE '%wishlist%';

UPDATE tasks SET app_section = 'brain' 
WHERE title ILIKE '%brain%' OR description ILIKE '%brain%' OR title ILIKE '%ai%';

UPDATE tasks SET app_section = 'scan' 
WHERE title ILIKE '%scan%' OR description ILIKE '%scan%' OR title ILIKE '%camera%';

UPDATE tasks SET app_section = 'storage' 
WHERE title ILIKE '%storage%' OR description ILIKE '%storage%' OR title ILIKE '%container%';

UPDATE tasks SET app_section = 'templates' 
WHERE title ILIKE '%template%' OR description ILIKE '%template%';

UPDATE tasks SET app_section = 'admin' 
WHERE title ILIKE '%admin%' OR description ILIKE '%admin%';

UPDATE tasks SET app_section = 'settings' 
WHERE title ILIKE '%settings%' OR description ILIKE '%settings%' OR title ILIKE '%profile%';

-- Set default for any remaining null values
UPDATE tasks SET app_section = 'general' WHERE app_section IS NULL;

-- Set default for new tasks
ALTER TABLE tasks ALTER COLUMN app_section SET DEFAULT 'general';

-- Add comment for documentation
COMMENT ON COLUMN tasks.app_section IS 'Which section of the app this task relates to (dashboard, collection, deck_builder, marketplace, wishlist, brain, scan, storage, templates, admin, settings, general)';