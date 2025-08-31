-- Add foreign key relationship between listings and cards
ALTER TABLE public.listings 
ADD CONSTRAINT listings_card_id_fkey 
FOREIGN KEY (card_id) REFERENCES public.cards(id);