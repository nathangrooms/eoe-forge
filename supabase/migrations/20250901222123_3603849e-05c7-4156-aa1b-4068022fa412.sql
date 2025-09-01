-- Storage System Tables (additive, non-destructive)

-- 1) Storage containers (boxes, binders, deckboxes, shelves, etc.)
CREATE TABLE IF NOT EXISTS storage_containers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('box','binder','deckbox','shelf','other','deck-linked')),
  color TEXT,
  icon TEXT,
  is_default BOOLEAN DEFAULT false,
  deck_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2) Optional slots/sections within a container (binder pages, box rows)
CREATE TABLE IF NOT EXISTS storage_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  container_id UUID NOT NULL REFERENCES storage_containers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER DEFAULT 0
);

-- 3) Card allocations into storage (printing-aware)
CREATE TABLE IF NOT EXISTS storage_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  container_id UUID NOT NULL REFERENCES storage_containers(id) ON DELETE CASCADE,
  slot_id UUID REFERENCES storage_slots(id),
  card_id TEXT NOT NULL REFERENCES cards(id),
  qty INTEGER NOT NULL CHECK (qty >= 0),
  foil BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_storage_containers_user ON storage_containers(user_id);
CREATE INDEX IF NOT EXISTS idx_storage_slots_container ON storage_slots(container_id);
CREATE INDEX IF NOT EXISTS idx_storage_items_container ON storage_items(container_id);
CREATE INDEX IF NOT EXISTS idx_storage_items_card ON storage_items(card_id);

-- RLS Policies
ALTER TABLE storage_containers ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_items ENABLE ROW LEVEL SECURITY;

-- Users can manage their own storage containers
CREATE POLICY "Users can manage their own storage containers" ON storage_containers
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Users can manage slots in their containers
CREATE POLICY "Users can manage their own storage slots" ON storage_slots
  FOR ALL USING (
    container_id IN (SELECT id FROM storage_containers WHERE user_id = auth.uid())
  ) WITH CHECK (
    container_id IN (SELECT id FROM storage_containers WHERE user_id = auth.uid())
  );

-- Users can manage items in their containers
CREATE POLICY "Users can manage their own storage items" ON storage_items
  FOR ALL USING (
    container_id IN (SELECT id FROM storage_containers WHERE user_id = auth.uid())
  ) WITH CHECK (
    container_id IN (SELECT id FROM storage_containers WHERE user_id = auth.uid())
  );

-- Triggers for updated_at
CREATE TRIGGER update_storage_containers_updated_at
  BEFORE UPDATE ON storage_containers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_storage_items_updated_at
  BEFORE UPDATE ON storage_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();