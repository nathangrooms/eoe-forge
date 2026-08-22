/**
 * Generate art, and keep it.
 *
 * The model key is a Supabase secret, so generation happens in the
 * `generate-art` edge function and never in the browser. This panel is only the
 * control surface: it holds the prompts, calls the function with the admin's
 * own session, and shows what came back.
 *
 * It lives in Admin because every call spends money. The function checks
 * `profiles.is_admin` itself as well, so hiding this tab is not the security
 * boundary, only the convenience.
 *
 * The presets are the play mode covers, which is why this was built. They
 * deliberately describe a MOOD AND A PLACE and never a Magic card, a mana
 * symbol, or anything resembling Wizards' artwork or a named artist's style.
 * A cover sits behind type, so every prompt asks for a dark frame and an empty
 * lower third for the words to sit in.
 */

import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Sparkles } from 'lucide-react';

/** A shared tail so the four covers read as one set rather than four pictures. */
const HOUSE =
  'Dark fantasy concept art, deep charcoal and warm amber light, heavy atmosphere, ' +
  'no text, no logos, no people facing the camera, cinematic wide composition, ' +
  'the lower third quiet and unlit so text can sit over it.';

const PRESETS: ReadonlyArray<{ name: string; label: string; prompt: string }> = [
  {
    name: 'play-mode-online',
    label: 'Online',
    prompt: `A long stone hall set for many players, lantern light on a worn table, empty chairs waiting, a sense of people about to arrive. ${HOUSE}`,
  },
  {
    name: 'play-mode-bots',
    label: 'Versus bots',
    prompt: `A single lit table opposite an empty seat in shadow, one lamp above it, the room beyond dark and still. ${HOUSE}`,
  },
  {
    name: 'play-mode-goldfish',
    label: 'Goldfish',
    prompt: `A quiet study at night, one chair, one table, papers and a single candle, nobody else in the room. ${HOUSE}`,
  },
  {
    name: 'play-mode-playtest',
    label: 'Playtest',
    prompt: `An empty amphitheatre seen from the back row, a lit stage far below, the seats in darkness, the feeling of watching. ${HOUSE}`,
  },
];

interface Made {
  name: string;
  url?: string;
  error?: string;
}

export function ArtStudio() {
  const [busy, setBusy] = useState<string | null>(null);
  const [made, setMade] = useState<Made[]>([]);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');

  /** One call. The function does the work; this only carries the session. */
  const generate = async (entry: { name: string; prompt: string }) => {
    setBusy(entry.name);
    try {
      const { data, error } = await supabase.functions.invoke('generate-art', {
        body: { prompt: entry.prompt, name: entry.name },
      });
      /* Show what the gateway actually said. A model name that turns out to be
         wrong should say so in its own words rather than becoming "failed". */
      const problem =
        error?.message ??
        (data as any)?.error ??
        ((data as any)?.gateway ? String((data as any).gateway) : null);
      setMade(prev => [
        { name: entry.name, url: (data as any)?.url, error: problem ?? undefined },
        ...prev.filter(m => m.name !== entry.name),
      ]);
    } catch (e: any) {
      setMade(prev => [{ name: entry.name, error: e?.message ?? String(e) }, ...prev]);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-5">
          <h3 className="text-sm font-semibold">Play mode covers</h3>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            Four covers for the play page, generated once and stored. Running one again replaces
            it, so a prompt can be tuned without collecting spares.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {PRESETS.map(preset => (
              <Button
                key={preset.name}
                variant="secondary"
                disabled={busy !== null}
                onClick={() => generate(preset)}
              >
                {busy === preset.name ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                {preset.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <h3 className="text-sm font-semibold">Anything else</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            For icons and whatever comes next. The name becomes the filename and may hold
            lowercase letters, numbers and hyphens.
          </p>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="icon-shopping-list"
            className="mt-3 h-9 border-0 bg-background/60"
          />
          <Textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Describe it. Say what it is for, not just what is in it."
            className="mt-2 min-h-24 border-0 bg-background/60"
          />
          <Button
            className="mt-3"
            disabled={busy !== null || !name.trim() || !prompt.trim()}
            onClick={() => generate({ name: name.trim(), prompt: prompt.trim() })}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Generate
          </Button>
        </CardContent>
      </Card>

      {made.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold">Made</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {made.map(item => (
                <div key={item.name} className="rounded-lg bg-muted/40 p-3">
                  <p className="font-mono text-xs">{item.name}</p>
                  {item.url ? (
                    <>
                      <img
                        src={item.url}
                        alt={item.name}
                        className="mt-2 aspect-video w-full rounded-md object-cover"
                      />
                      <p className="mt-1 break-all text-[0.7rem] text-muted-foreground">
                        {item.url}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 whitespace-pre-wrap text-xs text-destructive">
                      {item.error ?? 'Nothing came back.'}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default ArtStudio;
