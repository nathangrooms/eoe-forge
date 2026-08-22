/**
 * Generate an image and keep it, so the app can use it as a real asset.
 *
 * Owner wants cover art for the play modes and, shortly, custom icons. The
 * model key lives here rather than in the browser: LOVABLE_API_KEY is a
 * Supabase secret and must never reach a client.
 *
 *   POST /functions/v1/generate-art
 *   { "prompt": "...", "name": "play-mode-online", "bucket": "art" }
 *
 * Returns the storage path and a public URL. Calling it twice with the same
 * name overwrites, so a prompt can be iterated without collecting rubbish.
 *
 * ADMIN ONLY. This spends the owner's money on every call, so it checks
 * profiles.is_admin rather than merely requiring a signed-in user. It is not
 * something a visitor gets to run.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const GATEWAY = 'https://ai.gateway.lovable.dev/v1/chat/completions';

/* Both of these were probed against the live gateway and both answer.
   Pro is the default because the owner asked for the best rather than flash,
   and the difference in a painted illustration is not subtle. Flash stays as an
   override for cheap iteration on a prompt before spending pro credits on it.

   A wrong model name comes back as the gateway's own words rather than being
   swallowed, because a silent fallback to a text model would write a text file
   into an image bucket and look like a success. */
const DEFAULT_MODEL = 'google/gemini-3-pro-image-preview';
const CHEAP_MODEL = 'google/gemini-2.5-flash-image-preview';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const fail = (status: number, message: string, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  const key = Deno.env.get('LOVABLE_API_KEY');
  if (!key) return fail(500, 'LOVABLE_API_KEY is not set on this project.');

  const url = Deno.env.get('SUPABASE_URL')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const auth = req.headers.get('Authorization') ?? '';

  // Who is asking. The anon client reads the caller's JWT; the service client
  // does the writing, so storage rules do not have to be widened for this.
  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: who } = await asCaller.auth.getUser();
  if (!who?.user) return fail(401, 'Sign in first.');

  const admin = createClient(url, service);
  const { data: profile } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', who.user.id)
    .maybeSingle();
  if (!profile?.is_admin) return fail(403, 'Admins only. This call costs money.');

  let body: { prompt?: string; name?: string; bucket?: string; cheap?: boolean };
  try {
    body = await req.json();
  } catch {
    return fail(400, 'Send JSON.');
  }

  const prompt = (body.prompt ?? '').trim();
  const name = (body.name ?? '').trim();
  const bucket = (body.bucket ?? 'art').trim();
  if (!prompt) return fail(400, 'A prompt is required.');
  // The name becomes a storage path, so it may not wander out of the bucket.
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(name)) {
    return fail(400, 'name must be lowercase letters, numbers and hyphens.');
  }

  const answer = await fetch(GATEWAY, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: body.cheap ? CHEAP_MODEL : DEFAULT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      modalities: ['image', 'text'],
    }),
  });

  const text = await answer.text();
  if (!answer.ok) {
    // Hand the gateway's own words back. Guessing why a model refused is how
    // an afternoon disappears.
    return fail(answer.status, 'The image gateway refused.', { gateway: text.slice(0, 600) });
  }

  let payload: any;
  try {
    payload = JSON.parse(text);
  } catch {
    return fail(502, 'The gateway did not return JSON.', { body: text.slice(0, 600) });
  }

  /* Find the image wherever this gateway put it. Shapes differ between
     providers and versions, so look in the three known places rather than
     assuming one and failing opaquely. */
  const message = payload?.choices?.[0]?.message;
  const found: string | undefined =
    message?.images?.[0]?.image_url?.url ??
    message?.images?.[0]?.url ??
    (typeof message?.content === 'string' && message.content.startsWith('data:image')
      ? message.content
      : undefined);

  if (!found) {
    return fail(502, 'No image came back.', { shape: JSON.stringify(payload).slice(0, 600) });
  }

  const comma = found.indexOf(',');
  const meta = found.slice(0, comma);
  const bytes = Uint8Array.from(atob(found.slice(comma + 1)), c => c.charCodeAt(0));
  const type = /data:([^;]+)/.exec(meta)?.[1] ?? 'image/png';
  const ext = type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
  const path = `${name}.${ext}`;

  await admin.storage.createBucket(bucket, { public: true }).catch(() => {});
  const { error: upload } = await admin.storage
    .from(bucket)
    .upload(path, bytes, { contentType: type, upsert: true });
  if (upload) return fail(500, `Could not store it: ${upload.message}`);

  const { data: pub } = admin.storage.from(bucket).getPublicUrl(path);
  return new Response(
    JSON.stringify({ ok: true, bucket, path, url: pub.publicUrl, bytes: bytes.length, type }),
    { headers: { ...cors, 'Content-Type': 'application/json' } }
  );
});
