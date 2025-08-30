UPDATE sync_status 
SET status = 'failed', 
    error_message = 'Reset by admin - ready for new sync',
    last_sync = now()
WHERE id = 'scryfall_cards';