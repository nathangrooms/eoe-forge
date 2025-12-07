-- Reset sync status for fresh start
UPDATE sync_status 
SET status = 'idle', 
    current_step = null, 
    error_message = null,
    records_processed = 0,
    total_records = 0,
    step_progress = 0
WHERE id = 'scryfall_cards';