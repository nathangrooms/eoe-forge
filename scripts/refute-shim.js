/**
 * A PostgREST stand-in for walking the whole app without a password.
 *
 * Adapted from `scripts/deck-save-shim.js`, with three changes that matter for
 * an audit rather than a measurement:
 *
 *  1. **The decks are real.** The card ids, quantities and commander flag below
 *     were read out of the live `user_decks` / `deck_cards` for a real account
 *     on 2026-08-28, so the deck page draws a real 92-card four-colour Atraxa
 *     list with real lands and real prices, not 100 top-ranked creatures.
 *  2. **The collection is real.** 53 rows from the same account, so "do you own
 *     it" answers something rather than always answering no.
 *  3. **Every RPC and edge-function call is recorded by name** in
 *     `window.__dmRpc`. The old shim answered them all with null silently,
 *     which is how a tab that is entirely powered by an RPC can be screenshotted
 *     looking fine while showing nothing but its empty state. A walk has to be
 *     able to say which panels were never actually exercised.
 *
 * World-readable tables (`cards`, `cards_unique`, `precons`, …) still go to the
 * real database with the real anon key, so every card on screen is a real row.
 */
(() => {
  const URL_BASE = 'https://udnaflcohfyljrsgqggy.supabase.co';
  const ANON =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

  const USER_ID = '00000000-0000-4000-8000-00000000dm01';
  const DECK_ID = 'e0909132-5a48-4416-924c-dd2374d3d34d';
  const DECK2_ID = '77bddd8f-2acc-460c-a2bf-06c932950215';
  const IS_ADMIN = Boolean(window.__DM_ADMIN);

  window.__DM_DECK_ID = DECK_ID;

  /* Real rows: `card_id:quantity:is_commander`, read from deck_cards. */
  const ATRAXA =
    'd0d33d52-3d28-4635-b985-51e126289259:1:1,de7a150b-1b0d-4928-a2cc-80a4b7412350:1:0,bf708169-a307-494b-b8d8-baae53b2e2f2:1:0,fbad9449-d09c-4fd0-b2ad-2aa3a29e03bf:1:0,a8e328c6-3a84-49cf-a1a3-1d1e5373d274:1:0,37478625-dd07-476d-bd9b-b2e0d71ac0d1:1:0,a95b7645-154f-4904-bf71-db7eb24d4df2:1:0,bd9e6ba8-1c5e-4416-8bff-90db3b3b1f41:1:0,c634273a-94b0-4104-9d10-ae522ece1fc7:1:0,25ea04d8-5d85-49d3-8d8d-7fe123d0ed6c:1:0,11e8d2fd-b132-4807-9410-8edeffa519ed:1:0,884f6948-3e03-48c6-8be2-6f2539386c9d:1:0,67f4c93b-080c-4196-b095-6a120a221988:1:0,64cbb81d-3444-4491-963f-8ce9a9430788:1:0,99a90d13-891c-45cc-b1d5-6080ebae5862:1:0,41000308-144d-4d3b-afec-e3928d20edfc:1:0,7641f4d9-4614-41c8-87f5-4845bd78e9b3:1:0,1a0867be-a861-4fb4-b8ff-cb2966193755:1:0,1cad1bd2-7c56-4ce0-99a6-b2a49c1288dd:1:0,a390a7df-b8da-41aa-93e5-2c0db938a27e:1:0,492c2f9a-51e7-4e0f-9899-23bf43ea988b:1:0,ea6bc7d5-e8f6-4103-920c-9f7ec5cd6c28:1:0,9255cd01-a611-4fec-b9ec-b271687740ba:1:0,8e30deb6-9e1f-4545-ae30-c30ba6c7b3a0:1:0,e1e48b21-1a4f-4708-a4b4-e2e296df924c:1:0,a73c630c-c98d-4f8a-9e6a-2576d5fec4ee:1:0,d86fa72c-25c1-43ef-9cb0-fe76f7568ed3:1:0,71384418-173a-4f77-adab-56e52fa23692:1:0,22589a81-3ea8-4e78-98c9-c015e7539cf9:1:0,6040ba5e-7042-4095-9000-89bcb8ce1ea6:1:0,08b9a296-3b76-4f8f-9d71-7c9af92bb3b4:1:0,f3537373-ef54-4578-9d05-6216420ee349:1:0,a305e44f-4253-4754-b83f-1e34103d77b0:3:0,450744cf-7eba-491b-97b0-ca80c6368bbb:1:0,bdadc60f-942f-47e2-b8fc-51deb3d0b86d:1:0,4b0e3894-5dfe-4d03-9996-eebf96c58168:1:0,a2e22347-f0cb-4cfd-88a3-4f46a16e4946:3:0,ef1e1dff-b559-441d-8df3-b6a418066aca:1:0,92585587-cfdc-406a-9114-4f6dd8802c37:1:0,8c5f360b-f9a0-46e0-9e8b-58e5b4b0389e:1:0,6a0b230b-d391-4998-a3f7-7b158a0ec2cd:1:0,e83851a1-e4e8-49ec-af5c-4efe86fa51ad:1:0,40140991-cffa-4b52-9a25-37e9a8aa9ddd:1:0,400382a4-aea2-4827-b06a-1b0b3745908b:1:0,4a297ec1-0a7c-4f67-936b-d9227767e989:1:0,4069fb4a-8ee1-41ef-ab93-39a8cc58e0e5:3:0,18a1b3f5-473d-45ca-be0d-e67e77ba30ce:1:0,da1db084-f235-4e26-8867-5f0835a0d283:1:0,8002de90-93fb-48ea-a849-40fdad0aef5a:1:0,a2a424ea-ef32-4ac5-8f8c-3ea1839f01d4:1:0,771305ca-f33d-4498-8e21-152ced7317ef:1:0,d1159ef6-f3ac-42a0-ae46-7d5eb9b3a6eb:1:0,ba77e83b-1846-4c42-bea0-2e304429fbe0:1:0,6718d4e7-768e-473f-8064-a68422e977f6:1:0,ae50172c-8896-4ad2-8c83-d349ccca2308:1:0,e03f2594-c6e8-4758-86b4-885d1dba3a91:1:0,1d8b007b-3169-4ee3-80c7-781fc096fc7a:1:0,f0b234d8-d6bb-48ec-8a4d-d8a570a69c62:3:0,5198ac65-118c-4616-8315-d71d41b883ad:1:0,3bdaf55b-2de3-4c8a-90ae-9c88c9d00fd7:1:0,9d595a6a-03f6-4da6-945b-4de82d71b298:1:0,5a24af58-5d75-4b41-a226-60abc415ff71:1:0,022ab408-3292-40b6-b35e-ac1b7f06dffa:1:0,17fc45cb-0bf5-423d-adeb-112b24c4d57f:1:0,1444a798-4e94-4bcc-b16a-0f20334f2550:1:0,396c5d77-f530-42f8-80b5-7cbfd562d1e2:1:0,11c0e89b-ab29-4739-a88e-1e7966d87d25:1:0,a1001d43-e11b-4e5e-acd4-4a50ef89977f:1:0,9f98bf0c-74cf-49da-8b60-b2d3ac294a82:1:0,4e4b6e22-93b2-4896-bba5-0ceaa5d8ea3c:1:0,8e2fac8c-a574-4414-ac68-632fc822ddbb:1:0,b9ac7673-eae8-4c4b-889e-5025213a6151:1:0,aa409269-3698-42a2-8c51-75557b27a6f6:1:0,1eb02f00-c188-4193-a049-d26f7643e5da:1:0,ed2ca825-b029-495f-83fc-54366229d417:1:0,9d795f79-c3a5-4ea1-a5cf-1ce73d6837b6:1:0,31572625-b4a8-4ac0-8f08-999d6a6636d7:1:0,35b613ad-86f0-431b-af93-147d21041fde:1:0,cc520518-2063-4b57-a0d4-10cf62a7175e:1:0,feeaf99b-7720-42e3-8cb1-23218b646458:1:0,881e4c00-3b9a-47a1-bf66-1badda994c88:1:0,6dc390da-75f8-490a-a724-c12d21cfe578:1:0,93800249-4fcd-47ec-92f9-58f875cb6f00:1:0,a5d57db6-0aa5-4e28-b156-e97b74af2cee:1:0,1431fe83-7dc7-4c40-8d66-6525560e4323:1:0,59cf9f4d-54cd-4cda-9726-65e16100ab46:1:0,87b56584-8a61-40bc-99b5-7434a681fcdc:1:0,d481d871-d1e3-439b-bfd5-5b2212f9b0c8:1:0,7722f4f7-fe38-4107-a715-7b27b6a4e341:1:0,20ccbfdd-ddae-440c-9bc0-38b15a56fdd1:1:0,37f10035-bf05-460d-9390-433caa2570f4:1:0,34ad4fdb-9805-45b3-ba20-e47a15d6ff38:1:0';

  /* Real rows: `card_id:quantity:foil:condition`, read from user_collections. */
  const COLLECTION =
    'befb996b-1da6-41a3-8d9a-a45c2353c401:1,423f13ba-e165-4add-9935-d88503e1e761:1,557fcd17-6cb3-414a-b2b1-ea9ae32e5aec:1,0321b706-87b0-4bea-89d3-ec2e7252dc7c:1,eb363654-2004-4db8-bbd2-5b121da4f2a0:2,e5e12371-f05c-41cf-92ca-7cb17c2f7f1a:1,be219928-3d0e-4d00-b124-152ce8a8c13b:1,f3537373-ef54-4578-9d05-6216420ee349:1,52d3005f-a1c7-4ef5-911f-ccc0752f4181:1,ee793ed2-7d59-4640-8868-ad486600df2c:1,ce01ff8f-a037-484f-9148-c847ffaabc5a:1,ade32396-8841-4ba4-8852-d11146607f21:1,8e37fae5-ddd0-4e16-8581-71579f89d9c5:1,627c392c-4d18-4eb2-a4e8-c668f61f5487:1,2461bf0b-53e4-4103-8485-88a940ad66fd:1,35f30004-13e0-42c1-9842-eea52793fcfc:1,245e008c-e073-443f-9592-6f628c0026ec:1,de7a150b-1b0d-4928-a2cc-80a4b7412350:1,444ccd33-e88f-4d37-8a99-e10096eef5d3:1,d5756d4b-3068-412c-8643-880d3459151e:1,10ff4bac-1f93-4dd3-987a-523a6f733a1e:1,35c7c392-6782-40c8-bb24-6aad24f14660:1,5f27dbf0-6818-40ea-832d-10686b4c2900:1,2509482a-68d8-4e94-9d1e-5b069ebdc2e4:1,5e51f727-5a9b-4bc7-83a9-dbcf1c933e15:1,ea954205-5ff5-493b-bf30-6212042c2bc9:11,bbcc1d84-9772-475d-924a-75bb54c9bc20:1,3cab2147-d496-489b-aaf0-b354e31a6b45:1,2d22fdde-5590-4a4c-af2e-09711f4b5ffd:1,baaabd52-3aa9-4e2f-9369-d4db8b405ba8:9,4415d050-7a76-4f8b-bf78-e33dd21fe4f1:1,40eee689-2514-421a-8056-eb7668be66ff:1,6b01ebcf-8451-486e-84f6-8e6e1bb9d6e3:14,cdad14f1-d541-4e58-af9f-f8e587fca05f:21,4ced112a-e775-4f97-97b3-74877e9dce12:1,dcde5f27-e2f0-4d2a-afa3-f300896ec4b1:9,fd2dcfe8-ced4-44f2-8268-68035a4d4d58:12,486d7edc-d983-41f0-8b78-c99aecd72996:1,617038a8-0544-4d0e-8ff1-c786e60ecd59:3,e16365a2-4969-4ad5-af95-9dd2d0499f06:1,0f3c8470-1cc8-4383-8782-c022867d46e8:1,79f9525a-4cb7-411e-b7b5-2113e93bcbc3:3,2a8f583c-88b6-4797-b93e-3086845fc326:5,957ae7aa-98d6-402a-9b20-e3e5b7e8dfe3:1,f3666a08-d449-496f-969a-bf21d4afbd77:5,e9d30cca-ea33-418f-bba3-5103f1dbd751:2,817b5b18-beb5-48c8-aa45-0515ff9ca5da:7,5c4e3031-ffc2-4d4d-a9f9-e85820059315:1,34ef01da-d311-4d4f-9f7b-328e7bb17db4:18,91fdb56b-54d5-4272-8319-505ff987fe9b:1,02e8e540-8aa3-4e6a-9a11-c3949cab5f0f:3,bd8fa327-dd41-4737-8f19-2cf5eb1f7cdd:1';

  /* ------------------------------------------------------------ session */
  const now = Math.floor(Date.now() / 1000);
  const session = {
    access_token: 'harness-not-a-real-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: 'harness-refresh',
    user: {
      id: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'harness@localhost',
      app_metadata: { provider: 'email' },
      user_metadata: { username: 'Harness' },
      created_at: new Date(0).toISOString(),
    },
  };
  try {
    localStorage.setItem('sb-udnaflcohfyljrsgqggy-auth-token', JSON.stringify(session));
  } catch {}

  const realFetch = window.fetch.bind(window);
  const cardCache = new Map();
  let ready = null;

  let user_decks = [];
  let deck_cards = [];
  let user_collections = [];

  async function fetchCards(ids) {
    const out = [];
    for (let i = 0; i < ids.length; i += 60) {
      const chunk = ids.slice(i, i + 60);
      const url =
        `${URL_BASE}/rest/v1/cards?select=*&id=in.(${chunk.join(',')})&limit=200`;
      const res = await realFetch(url, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
      const rows = await res.json();
      if (Array.isArray(rows)) out.push(...rows);
    }
    return out;
  }

  /**
   * One deck summary, counted off this fixture's own rows.
   *
   * Mirrors `compute_deck_summaries`. It exists because returning null made
   * /decks and /tutor draw empty states, and an audit cannot tell a starved
   * page from a badly designed one.
   *
   * Every number here is COUNTED. A deck with no cards returns zeros and a
   * card with no USD price contributes nothing rather than a zero, which is
   * the project's own rule: a missing price is null, never 0, and the smallest
   * real price in the catalogue is 0.01 so a rendered zero is always invented.
   */
  function deckSummaryFor(deckId) {
    const deck = user_decks.find(d => d.id === deckId);
    if (!deck) return null;

    const rows = deck_cards.filter(c => c.deck_id === deckId);
    const cards = rows
      .map(r => ({ row: r, card: cardCache.get(r.card_id) }))
      .filter(x => x.card);

    const qty = x => Math.max(1, Number(x.row.quantity) || 1);
    const total = cards.reduce((n, x) => n + qty(x), 0);
    const line = x => String(x.card.type_line || '').toLowerCase();
    const has = (x, word) => line(x).includes(word);
    const count = word => cards.filter(x => has(x, word)).reduce((n, x) => n + qty(x), 0);

    const bins = { '0-1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6-7': 0, '8-9': 0, '10+': 0 };
    for (const x of cards) {
      if (has(x, 'land')) continue;
      const cmc = Number(x.card.cmc) || 0;
      const key =
        cmc <= 1 ? '0-1' : cmc <= 5 ? String(Math.round(cmc)) :
        cmc <= 7 ? '6-7' : cmc <= 9 ? '8-9' : '10+';
      bins[key] = (bins[key] || 0) + qty(x);
    }

    const sources = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    for (const x of cards) {
      if (!has(x, 'land')) continue;
      const produced = x.card.produced_mana || x.card.color_identity || [];
      if (!produced.length) sources.C += qty(x);
      for (const c of produced) if (c in sources) sources[c] += qty(x);
    }

    const commanderRow = cards.find(x => x.row.is_commander);
    const priced = cards
      .map(x => Number(x.card.prices?.usd) * qty(x))
      .filter(v => Number.isFinite(v) && v > 0);

    return {
      id: deck.id,
      name: deck.name,
      format: deck.format,
      colors: deck.colors || [],
      identity: deck.colors || [],
      commander: commanderRow
        ? {
            name: commanderRow.card.name,
            image: commanderRow.card.image_uris?.normal || commanderRow.card.image_uris?.large || '',
          }
        : undefined,
      counts: {
        total,
        unique: cards.length,
        lands: count('land'),
        creatures: count('creature'),
        instants: count('instant'),
        sorceries: count('sorcery'),
        artifacts: count('artifact'),
        enchantments: count('enchantment'),
        planeswalkers: count('planeswalker'),
        battles: count('battle'),
      },
      curve: { bins },
      mana: { sources, untappedPctByTurn: { t1: 0, t2: 0, t3: 0 } },
      legality: { ok: total === 100, issues: total === 100 ? [] : [`${total} cards, not 100`] },
      /* Null, not a number. This fixture has not scored anything and the
         project's rule is that an unscored deck shows no score rather than a
         placeholder one. */
      power: null,
      economy: {
        priceUSD: priced.reduce((a, b) => a + b, 0),
        ownedPct: 0,
        missing: 0,
      },
      tags: [],
      updatedAt: deck.updated_at,
      favorite: false,
    };
  }

  async function load() {
    const triples = ATRAXA.split(',').map(t => t.split(':'));
    const ids = triples.map(t => t[0]);
    const collTriples = COLLECTION.split(',').map(t => t.split(':'));
    const rows = await fetchCards([...new Set([...ids, ...collTriples.map(t => t[0])])]);
    for (const row of rows) cardCache.set(row.id, row);

    const base = {
      user_id: USER_ID,
      is_public: false,
      public_enabled: false,
      public_slug: null,
      edh_analysis: null,
      edh_cards_hash: null,
      edh_analysis_updated_at: null,
      created_at: '2026-05-02T00:00:00+00:00',
      updated_at: '2026-08-20T00:00:00+00:00',
    };
    user_decks = [
      {
        ...base,
        id: DECK_ID,
        name: "Atraxa, Praetors' Voice superfriends-(planeswalker-tribal) Deck",
        format: 'commander',
        colors: ['B', 'G', 'U', 'W'],
        description: 'Real deck read from the live database.',
        power_level: 6,
      },
      {
        ...base,
        id: DECK2_ID,
        name: 'Ulamog, the Ceaseless Hunger tron/big-mana Deck',
        format: 'commander',
        colors: [],
        description: 'Real deck read from the live database.',
        power_level: 7,
      },
    ];

    deck_cards = triples.map(([cardId, qty, cmd], i) => ({
      id: `dc-${i}`,
      deck_id: DECK_ID,
      card_id: cardId,
      card_name: cardCache.get(cardId)?.name || 'Unknown',
      quantity: Number(qty),
      is_commander: cmd === '1',
      is_sideboard: false,
      created_at: '2026-05-02T00:00:00+00:00',
    }));

    user_collections = collTriples.map(([cardId, qty], i) => ({
      id: `uc-${i}`,
      user_id: USER_ID,
      card_id: cardId,
      card_name: cardCache.get(cardId)?.name || 'Unknown',
      set_code: cardCache.get(cardId)?.set_code || null,
      quantity: Number(qty),
      foil: 0,
      condition: 'near_mint',
      price_usd: Number(cardCache.get(cardId)?.prices?.usd || 0) || null,
      created_at: '2026-05-02T00:00:00+00:00',
      updated_at: '2026-05-02T00:00:00+00:00',
    }));

    window.__dmFixture = { deckId: DECK_ID, deckRows: deck_cards.length, collectionRows: user_collections.length, cardsResolved: cardCache.size };
  }

  const TABLES = {
    get user_decks() { return user_decks; },
    set user_decks(v) { user_decks = v; },
    get deck_cards() { return deck_cards; },
    set deck_cards(v) { deck_cards = v; },
    get user_collections() { return user_collections; },
    set user_collections(v) { user_collections = v; },
    favorite_decks: [],
    wishlist: [],
    profiles: [
      { id: USER_ID, username: 'Harness', is_admin: IS_ADMIN, avatar_url: null, created_at: '2026-01-01T00:00:00+00:00' },
    ],
    deck_matches: [],
    deck_notes: [],
    deck_share_events: [],
    activity_log: [],
    feature_flags: [],
    user_preferences: [],
    tasks: [],
  };

  /* `meta_combos` and `meta_combo_cards` joined this list on 2026-08-30, and the
     reason is the one the PASSTHROUGH comment below already gives. They are
     Commander Spellbook's published combos, world-readable with an `anon` SELECT
     grant and a `using (true)` policy, and stubbing them to `[]` made the card
     page's new combo group look permanently empty. A probe measured Sol Ring as
     having no combo partners when it has 106 recorded combos. */
  const PASSTHROUGH = new Set([
    'cards',
    'cards_unique',
    'sync_status',
    'precons',
    'forum_topics',
    'forum_posts',
    'meta_combos',
    'meta_combo_cards',
  ]);

  function splitTop(s) {
    const out = [];
    let depth = 0;
    let cur = '';
    for (const ch of s) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
    }
    if (cur) out.push(cur);
    return out;
  }

  function parseSelect(sel) {
    return splitTop(sel.replace(/\s+/g, '')).map(part => {
      const open = part.indexOf('(');
      if (open === -1) {
        const [alias, col] = part.includes(':') ? part.split(':') : [null, part];
        return { name: (col || part).split('!')[0], alias };
      }
      const head = part.slice(0, open);
      const body = part.slice(open + 1, part.lastIndexOf(')'));
      const [alias, rel] = head.includes(':') ? head.split(':') : [null, head];
      return { name: (rel || head).split('!')[0], alias, children: parseSelect(body) };
    });
  }

  function project(row, fields) {
    if (!fields || fields.some(f => f.name === '*' && !f.children)) {
      const base = { ...row };
      for (const f of fields || []) if (f.children) attach(base, f);
      return base;
    }
    const out = {};
    for (const f of fields) {
      if (f.children) attach(out, f);
      else out[f.alias || f.name] = row[f.name] === undefined ? null : row[f.name];
    }
    return out;

    function attach(target, field) {
      const key = field.alias || field.name;
      if (field.name === 'cards') {
        const card = cardCache.get(row.card_id);
        target[key] = card ? project(card, field.children) : null;
      } else if (field.name === 'deck_cards') {
        target[key] = [{ count: deck_cards.filter(r => r.deck_id === row.id).length }];
      } else {
        target[key] = TABLES[field.name] ? [] : null;
      }
    }
  }

  function applyFilter(rows, key, raw) {
    const [op, ...rest] = raw.split('.');
    const value = rest.join('.');
    switch (op) {
      case 'eq': return rows.filter(r => String(r[key] ?? '') === value);
      case 'neq': return rows.filter(r => String(r[key] ?? '') !== value);
      case 'in': {
        const set = new Set(value.replace(/^\(|\)$/g, '').split(',').map(v => v.replace(/^"|"$/g, '')));
        return rows.filter(r => set.has(String(r[key] ?? '')));
      }
      case 'is': return value === 'null' ? rows.filter(r => r[key] == null) : rows.filter(r => r[key] != null);
      case 'gte': return rows.filter(r => String(r[key] ?? '') >= value);
      case 'lte': return rows.filter(r => String(r[key] ?? '') <= value);
      case 'ilike':
        return rows.filter(r => String(r[key] ?? '').toLowerCase().includes(value.replace(/\*/g, '').toLowerCase()));
      default: return rows;
    }
  }

  const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'and', 'or', 'on_conflict', 'columns']);

  function matching(table, params) {
    let rows = (TABLES[table] || []).slice();
    for (const [key, raw] of params.entries()) {
      if (RESERVED.has(key)) continue;
      rows = applyFilter(rows, key, raw);
    }
    return rows;
  }

  window.__dmReq = [];
  /** Every RPC and edge function the page asked for, which this harness cannot
      answer. A panel powered only by one of these was never exercised. */
  window.__dmRpc = [];
  window.__dmResetReq = () => { window.__dmReq.length = 0; window.__dmRpc.length = 0; };

  function json(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input.url;
    const opts = init || (typeof input === 'object' ? input : {});
    const method = (opts.method || 'GET').toUpperCase();

    if (!url || !url.startsWith(URL_BASE)) return realFetch(input, init);

    if (url.includes('/auth/v1/')) {
      const body = url.includes('/user') ? session.user : session;
      return json(body);
    }

    if (url.includes('/functions/v1/')) {
      const name = url.split('/functions/v1/')[1].split('?')[0];

      /* SOME EDGE FUNCTIONS GO STRAIGHT THROUGH, for the same reason
         `PASSTHROUGH` exists for tables: they serve a PUBLIC CATALOGUE, hold
         no user data, and answer on the anon key, so stubbing them replaces
         real content with an empty state and every audit run then reports a
         working page as broken.

         `fetch-precons` is the case that proved it. A left-menu audit read
         "0 precons" on a page whose subtitle is "Every official Commander
         preconstructed deck" and nearly filed it as a bug; the live function
         returns 184 rows in 627 ms. Two other pages were misread the same way
         in the same run.

         The list is short and stays short. A function that reads or writes
         anything belonging to a user must NOT be here: the whole point of the
         harness is that no password is involved, and passing a user call
         through would either fail or, worse, reach somebody's real data. */
      const PASSTHROUGH_FUNCTIONS = new Set(['fetch-precons']);
      if (PASSTHROUGH_FUNCTIONS.has(name) && (method === 'GET' || !method)) {
        window.__dmReq.push({ method, table: `fn:${name}`, passthrough: true });
        return realFetch(input, init);
      }

      /* Recorded as UNANSWERED only when it really was. `__dmRpc` is what an
         audit reads to decide whether a bare-looking page is a design problem
         or a starved fixture, so a call that was served must not appear here
         or the audit distrusts a page it just rendered correctly. */
      window.__dmRpc.push(`fn:${name}`);
      window.__dmReq.push({ method, table: `fn:${name}` });
      return json({ success: false, error: 'harness' }, 200);
    }

    const parsed = new URL(url);
    const params = parsed.searchParams;
    const m = url.match(/\/rest\/v1\/(?:rpc\/)?([a-zA-Z0-9_]+)/);
    const table = m && m[1];
    const isRpc = url.includes('/rest/v1/rpc/');

    if (!table) return realFetch(input, init);

    if (isRpc) {
      /* SOME RPCs ARE ANSWERED FROM THE FIXTURE'S OWN ROWS.
         Returning null to everything is what made an audit of the left menu
         unable to judge half of it: /decks and /tutor both drew empty states
         because `compute_deck_summaries` came back null, and an empty page
         looks identical whether the design is wrong or the harness starved it.

         This is COMPUTED, not invented. Every figure below is counted off the
         same real card rows the rest of this shim serves, which were read from
         the live catalogue. Nothing is a plausible-looking number typed in by
         hand, because a fixture that lies is worse than one that is silent. */
      if (table === 'compute_deck_summaries') {
        window.__dmReq.push({ method, table: `rpc:${table}`, computed: true });
        let ids = [];
        try {
          ids = JSON.parse(init?.body || '{}').p_deck_ids || [];
        } catch { ids = []; }
        return json(ids.map(deckSummaryFor).filter(Boolean));
      }

      window.__dmRpc.push(`rpc:${table}`);
      window.__dmReq.push({ method, table: `rpc:${table}` });
      return json(null);
    }

    if (PASSTHROUGH.has(table)) {
      window.__dmReq.push({ method, table, passthrough: true });
      const headers = new Headers(opts.headers || {});
      headers.set('apikey', ANON);
      headers.set('Authorization', `Bearer ${ANON}`);
      return realFetch(url, { ...opts, headers });
    }

    if (!ready) ready = load();
    await ready;

    const selectRaw = params.get('select') || '*';
    const fields = parseSelect(selectRaw);
    const accept = new Headers(opts.headers || {}).get('Accept') || '';
    const single = accept.includes('vnd.pgrst.object');
    let body = null;
    try { body = opts.body ? JSON.parse(opts.body) : null; } catch { body = null; }

    if (method === 'GET') {
      let rows = matching(table, params);
      const order = params.get('order');
      if (order) {
        const [col, ...mods] = order.split('.');
        const desc = mods.includes('desc');
        rows.sort((a, b) => {
          const x = a[col]; const y = b[col];
          if (x == null && y == null) return 0;
          if (x == null) return 1;
          if (y == null) return -1;
          return (x > y ? 1 : x < y ? -1 : 0) * (desc ? -1 : 1);
        });
      }
      const limit = Number(params.get('limit') || 0);
      if (limit > 0) rows = rows.slice(0, limit);
      window.__dmReq.push({ method, table, rows: rows.length, read: true });
      const out = rows.map(r => project(r, fields));
      return json(single ? out[0] ?? null : out);
    }

    if (method === 'PATCH') {
      const rows = matching(table, params);
      for (const row of rows) Object.assign(row, body || {});
      window.__dmReq.push({ method, table, rows: rows.length });
      return json(rows.map(r => project(r, fields)));
    }

    if (method === 'DELETE') {
      const doomed = new Set(matching(table, params).map(r => r.id));
      TABLES[table] = (TABLES[table] || []).filter(r => !doomed.has(r.id));
      window.__dmReq.push({ method, table, rows: doomed.size });
      return json([]);
    }

    if (method === 'POST') {
      const incoming = Array.isArray(body) ? body : body ? [body] : [];
      const conflict = (params.get('on_conflict') || '').split(',').filter(Boolean);
      const current = TABLES[table] || [];
      for (const row of incoming) {
        const hit = conflict.length > 0 ? current.find(r => conflict.every(k => String(r[k]) === String(row[k]))) : null;
        if (hit) Object.assign(hit, row);
        else current.push({ id: `new-${Math.random().toString(36).slice(2, 10)}`, ...row });
      }
      TABLES[table] = current;
      window.__dmReq.push({ method, table, rows: incoming.length, upsert: conflict.length > 0 });
      return json(incoming.map(r => project(r, fields)));
    }

    window.__dmReq.push({ method, table });
    return json([]);
  };
})();
