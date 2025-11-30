-- Add deck folders for organization
CREATE TABLE IF NOT EXISTS public.deck_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  icon TEXT DEFAULT 'folder',
  position INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.deck_folders ENABLE ROW LEVEL SECURITY;

-- RLS policies for deck_folders
CREATE POLICY "Users can manage their own deck folders"
ON public.deck_folders
FOR ALL
USING (auth.uid() = user_id);

-- Add folder_id column to user_decks
ALTER TABLE public.user_decks 
ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.deck_folders(id) ON DELETE SET NULL;

-- Add maybeboard support
CREATE TABLE IF NOT EXISTS public.deck_maybeboard (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deck_id UUID NOT NULL REFERENCES public.user_decks(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL,
  card_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.deck_maybeboard ENABLE ROW LEVEL SECURITY;

-- RLS policies for maybeboard
CREATE POLICY "Users can manage maybeboard for their own decks"
ON public.deck_maybeboard
FOR ALL
USING (EXISTS (
  SELECT 1 FROM user_decks
  WHERE user_decks.id = deck_maybeboard.deck_id
  AND user_decks.user_id = auth.uid()
));

-- Add deck versioning support
CREATE TABLE IF NOT EXISTS public.deck_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deck_id UUID NOT NULL REFERENCES public.user_decks(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  cards JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

-- Enable RLS  
ALTER TABLE public.deck_versions ENABLE ROW LEVEL SECURITY;

-- RLS policies for deck versions
CREATE POLICY "Users can view versions of their own decks"
ON public.deck_versions
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM user_decks
  WHERE user_decks.id = deck_versions.deck_id
  AND user_decks.user_id = auth.uid()
));

CREATE POLICY "Users can create versions of their own decks"
ON public.deck_versions
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM user_decks
  WHERE user_decks.id = deck_versions.deck_id
  AND user_decks.user_id = auth.uid()
));

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_deck_folders_user_id ON public.deck_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_deck_folders_position ON public.deck_folders(position);
CREATE INDEX IF NOT EXISTS idx_user_decks_folder_id ON public.user_decks(folder_id);
CREATE INDEX IF NOT EXISTS idx_deck_maybeboard_deck_id ON public.deck_maybeboard(deck_id);
CREATE INDEX IF NOT EXISTS idx_deck_maybeboard_card_id ON public.deck_maybeboard(card_id);
CREATE INDEX IF NOT EXISTS idx_deck_versions_deck_id ON public.deck_versions(deck_id);
CREATE INDEX IF NOT EXISTS idx_deck_versions_version_number ON public.deck_versions(deck_id, version_number);