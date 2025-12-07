-- Reset sync status for fresh start
UPDATE sync_status 
SET status = 'completed', 
    error_message = NULL,
    current_step = 'ready',
    records_processed = 0,
    total_records = 0
WHERE id = 'scryfall_cards';