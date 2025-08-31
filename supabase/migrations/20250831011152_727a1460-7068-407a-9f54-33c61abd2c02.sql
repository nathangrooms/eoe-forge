-- Reset the sync status to allow restart
UPDATE sync_status 
SET status = 'failed', 
    error_message = 'Sync appeared stuck at 8100 cards - manually reset',
    current_step = 'reset'
WHERE id = 'scryfall_cards';