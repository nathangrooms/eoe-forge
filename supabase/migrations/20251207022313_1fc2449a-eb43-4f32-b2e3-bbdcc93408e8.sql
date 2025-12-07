-- Reset stuck sync status
UPDATE sync_status 
SET status = 'idle', 
    current_step = null, 
    error_message = null,
    records_processed = 0,
    total_records = 0
WHERE id = 'scryfall_cards';