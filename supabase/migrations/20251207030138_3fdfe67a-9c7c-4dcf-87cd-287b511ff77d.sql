-- Force reset sync status to idle for fresh start
UPDATE sync_status 
SET status = 'idle', 
    current_step = null, 
    error_message = null,
    records_processed = 0,
    total_records = 0,
    step_progress = 0,
    last_sync = now()
WHERE id = 'scryfall_cards';