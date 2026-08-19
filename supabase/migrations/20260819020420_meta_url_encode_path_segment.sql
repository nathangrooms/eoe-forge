-- Percent-encode a URL path segment, byte by byte, per RFC 3986.
--
-- Not optional. Six MTGJSON deck file names carry non-ASCII characters, all of them World
-- Championship decks named after their players: CarlosRomaoPsychatog_WC02 (a with tilde),
-- JakubSlemr..._WC99 (S with caron), JanoschKuhn..._WC00 (u with umlaut). A naive
-- replace() of spaces leaves the raw UTF-8 bytes in the URL, and the request fails before it
-- reaches the network. Encoding must happen on the UTF-8 BYTES, not the characters, which is
-- why this walks convert_to(...,'UTF8') rather than the text.

create or replace function public.meta_url_encode(p_text text)
returns text
language sql immutable strict
as $$
  select coalesce(string_agg(
    case
      when b between 48 and 57      -- 0-9
        or b between 65 and 90      -- A-Z
        or b between 97 and 122     -- a-z
        or b in (45, 46, 95, 126)   -- - . _ ~  (RFC 3986 unreserved)
      then chr(b)
      else '%' || upper(lpad(to_hex(b), 2, '0'))
    end, '' order by g), '')
  from generate_series(0, octet_length(convert_to(p_text, 'UTF8')) - 1) g,
       lateral (select get_byte(convert_to(p_text, 'UTF8'), g) as b) x;
$$;

comment on function public.meta_url_encode(text) is
  'RFC 3986 percent-encoding of a URL path segment, operating on UTF-8 bytes. Required for MTGJSON deck file names carrying accented player names.';

grant execute on function public.meta_url_encode(text) to anon, authenticated, service_role;

-- Rebuild the queued MTGJSON URLs with the correct encoder.
update public.meta_fetch_queue
   set url = 'https://mtgjson.com/api/v5/decks/' || public.meta_url_encode(ref) || '.json'
 where source_id = 'mtgjson';;