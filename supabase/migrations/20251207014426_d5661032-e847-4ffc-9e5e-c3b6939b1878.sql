-- Reset the stuck sync status so a new sync can be started
UPDATE sync_status 
SET status = 'completed', 
    error_message = NULL,
    current_step = 'ready'
WHERE id = 'scryfall_cards' AND status = 'running';