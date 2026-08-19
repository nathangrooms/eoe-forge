/* Gitignored puppeteer harness for /tutor. Written by
 * scripts/tutor-land-shots.mjs. Not shipped, not routed, not built. */
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import '../index.css';
import { AuthProvider } from '../components/AuthProvider';
import { TooltipProvider } from '../components/ui/tooltip';
import { supabase } from '../integrations/supabase/client';
import { DeckAPI } from '../lib/api/deckAPI';
import Tutor from '../pages/Tutor';

const SUMMARY = {"id":"e0909132-5a48-4416-924c-dd2374d3d34d","name":"Atraxa, Praetors' Voice superfriends-(planeswalker-tribal) Deck","format":"commander","colors":["B","G","U","W"],"identity":["B","G","U","W"],"tags":[],"favorite":false,"is_public":false,"power_level":3,"updatedAt":"2026-01-31T23:47:15.215277+00:00","created_at":"2026-01-31T23:47:15.215277+00:00","description":"AI-generated superfriends-(planeswalker-tribal) deck with Atraxa, Praetors' Voice.","mana":{"basis":"lands","sources":{"B":10,"C":14,"G":15,"R":4,"U":10,"W":9},"unknownLands":[],"landsMakingNoManaThemselves":[],"untappedPctByTurn":{"t1":95,"t2":90,"t3":85}},"curve":{"bins":{"2":15,"3":18,"4":13,"5":4,"0-1":46,"6-7":4,"8-9":0,"10+":0}},"counts":{"total":100,"unique":92,"sideboard":0,"lands":36,"creatures":42,"instants":7,"sorceries":5,"artifacts":4,"enchantments":1,"planeswalkers":6,"battles":0},"economy":{"missing":99,"ownedPct":1,"priceUSD":358.75},"legality":{"ok":true,"issues":[]},"power":null,"edhAnalysis":null,"commander":{"name":"Atraxa, Praetors' Voice","image":"https://cards.scryfall.io/normal/front/d/0/d0d33d52-3d28-4635-b985-51e126289259.jpg?1783930136","image_uris":{"small":"https://cards.scryfall.io/small/front/d/0/d0d33d52-3d28-4635-b985-51e126289259.jpg?1783930136","normal":"https://cards.scryfall.io/normal/front/d/0/d0d33d52-3d28-4635-b985-51e126289259.jpg?1783930136","large":"https://cards.scryfall.io/large/front/d/0/d0d33d52-3d28-4635-b985-51e126289259.jpg?1783930136","art_crop":"https://cards.scryfall.io/art_crop/front/d/0/d0d33d52-3d28-4635-b985-51e126289259.jpg?1783930136"}}};
const DECK_CARDS = [{"card_id":"de7a150b-1b0d-4928-a2cc-80a4b7412350","card_name":"Aang, Airbending Master","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"bf708169-a307-494b-b8d8-baae53b2e2f2","card_name":"Abigale, Eloquent First-Year","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"fbad9449-d09c-4fd0-b2ad-2aa3a29e03bf","card_name":"Abjure","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"a8e328c6-3a84-49cf-a1a3-1d1e5373d274","card_name":"Abrupt Decay","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"21892cbc-1af2-4ea1-8907-cec514b53004","card_name":"Absorb","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"37478625-dd07-476d-bd9b-b2e0d71ac0d1","card_name":"Abundant Countryside","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"a95b7645-154f-4904-bf71-db7eb24d4df2","card_name":"Academy Ruins","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"bd9e6ba8-1c5e-4416-8bff-90db3b3b1f41","card_name":"Accursed Duneyard","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"c634273a-94b0-4104-9d10-ae522ece1fc7","card_name":"Adagia, Windswept Bastion","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"8833065e-5022-4f48-b2fd-6fe5647c0a07","card_name":"Aerial Responder","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"25ea04d8-5d85-49d3-8d8d-7fe123d0ed6c","card_name":"Aether Hub","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"11e8d2fd-b132-4807-9410-8edeffa519ed","card_name":"Aether Vial","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"884f6948-3e03-48c6-8be2-6f2539386c9d","card_name":"Aetherworks Marvel","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"67f4c93b-080c-4196-b095-6a120a221988","card_name":"Agadeem's Awakening // Agadeem, the Undercrypt","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"64cbb81d-3444-4491-963f-8ce9a9430788","card_name":"Agent's Toolkit","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"99a90d13-891c-45cc-b1d5-6080ebae5862","card_name":"Airbender Ascension","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"41000308-144d-4d3b-afec-e3928d20edfc","card_name":"Ajani Unyielding","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"4c565076-5db2-47ea-8ee0-4a4fd7bb353d","card_name":"Ajani, Adversary of Tyrants","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"59793f1c-8c7e-433e-9c09-40aa3ce931a1","card_name":"Ajani, Caller of the Pride","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"dba41e5f-66b8-4459-8a07-bbe893216f1e","card_name":"Ajani, Inspiring Leader","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"7641f4d9-4614-41c8-87f5-4845bd78e9b3","card_name":"Ajani, Sleeper Agent","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"79883468-a37c-4894-8d05-6a4d150b7d59","card_name":"Ajani, Strength of the Pride","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"1a0867be-a861-4fb4-b8ff-cb2966193755","card_name":"Aphelia, Viper Whisperer","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"d0d33d52-3d28-4635-b985-51e126289259","card_name":"Atraxa, Praetors' Voice","quantity":1,"is_commander":true,"is_sideboard":false},{"card_id":"ea6bc7d5-e8f6-4103-920c-9f7ec5cd6c28","card_name":"Blast Zone","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"counterspell-lea","card_name":"Counterspell","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"a305e44f-4253-4754-b83f-1e34103d77b0","card_name":"Forest","quantity":3,"is_commander":false,"is_sideboard":false},{"card_id":"bdadc60f-942f-47e2-b8fc-51deb3d0b86d","card_name":"Immortal Obligation","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"4b0e3894-5dfe-4d03-9996-eebf96c58168","card_name":"Intervene","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"a2e22347-f0cb-4cfd-88a3-4f46a16e4946","card_name":"Island","quantity":3,"is_commander":false,"is_sideboard":false},{"card_id":"ef1e1dff-b559-441d-8df3-b6a418066aca","card_name":"Kodama of the West Tree","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"92585587-cfdc-406a-9114-4f6dd8802c37","card_name":"Kozilek's Command","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"8c5f360b-f9a0-46e0-9e8b-58e5b4b0389e","card_name":"Lady Octopus, Inspired Inventor","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"e83851a1-e4e8-49ec-af5c-4efe86fa51ad","card_name":"Melira, Sylvok Outcast","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"4a297ec1-0a7c-4f67-936b-d9227767e989","card_name":"Overgrown Tomb","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"8d8df09f-d22f-4f29-b920-358433f81b76","card_name":"Phyrexia's Core","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"4069fb4a-8ee1-41ef-ab93-39a8cc58e0e5","card_name":"Plains","quantity":3,"is_commander":false,"is_sideboard":false},{"card_id":"18a1b3f5-473d-45ca-be0d-e67e77ba30ce","card_name":"Reflecting Pool","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"da1db084-f235-4e26-8867-5f0835a0d283","card_name":"Rimewood Falls","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"d2507bc2-da17-4e46-b4c5-ba0080ce2c6f","card_name":"Rishadan Port","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"8002de90-93fb-48ea-a849-40fdad0aef5a","card_name":"Roadside Reliquary","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"a2a424ea-ef32-4ac5-8f8c-3ea1839f01d4","card_name":"Rogue's Passage","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"771305ca-f33d-4498-8e21-152ced7317ef","card_name":"Ruinous Path","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"d1159ef6-f3ac-42a0-ae46-7d5eb9b3a6eb","card_name":"Ruins of Oran-Rief","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"81d3099d-4f22-425c-8955-903b6cfb88d3","card_name":"Sapseep Forest","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"ba77e83b-1846-4c42-bea0-2e304429fbe0","card_name":"Savior of Ollenbock","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"6718d4e7-768e-473f-8064-a68422e977f6","card_name":"Selesnya Guildgate","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"ae50172c-8896-4ad2-8c83-d349ccca2308","card_name":"Sequence Engine","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"e03f2594-c6e8-4758-86b4-885d1dba3a91","card_name":"Shimmering Grotto","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"f0b234d8-d6bb-48ec-8a4d-d8a570a69c62","card_name":"Swamp","quantity":3,"is_commander":false,"is_sideboard":false},{"card_id":"5198ac65-118c-4616-8315-d71d41b883ad","card_name":"Wren's Run Hydra","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"3bdaf55b-2de3-4c8a-90ae-9c88c9d00fd7","card_name":"Wretched Banquet","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"c96b11ad-67fd-4a2b-89ea-e9df9c50731e","card_name":"Wrexial, the Risen Deep","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"9d595a6a-03f6-4da6-945b-4de82d71b298","card_name":"Wrinkly Monkey Shenanigans","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"5a24af58-5d75-4b41-a226-60abc415ff71","card_name":"Wyluli Wolf","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"022ab408-3292-40b6-b35e-ac1b7f06dffa","card_name":"Xantid Swarm","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"94a420c2-b1a8-4a98-a2a5-7f949d3081bc","card_name":"Xavier Sal, Infested Captain","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"17fc45cb-0bf5-423d-adeb-112b24c4d57f","card_name":"Xenosquirrels","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"1444a798-4e94-4bcc-b16a-0f20334f2550","card_name":"Xolatoyac, the Smiling Flood","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"c7f2c2d5-e052-49e8-b5de-712858c2ea78","card_name":"Y'shtola, Night's Blessed","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"396c5d77-f530-42f8-80b5-7cbfd562d1e2","card_name":"Yahenni, Undying Partisan","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"11c0e89b-ab29-4739-a88e-1e7966d87d25","card_name":"Yannik, Scavenging Sentinel","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"a1001d43-e11b-4e5e-acd4-4a50ef89977f","card_name":"Yarok, the Desecrated","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"9f98bf0c-74cf-49da-8b60-b2d3ac294a82","card_name":"Yavimaya Coast","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"4e4b6e22-93b2-4896-bba5-0ceaa5d8ea3c","card_name":"Yavimaya, Cradle of Growth","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"b5a79f5d-d0df-4799-ac3a-84305e3af0c9","card_name":"Yawgmoth, Thran Physician","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"8e2fac8c-a574-4414-ac68-632fc822ddbb","card_name":"Yes Man, Personal Securitron","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"b9ac7673-eae8-4c4b-889e-5025213a6151","card_name":"Ygra, Eater of All","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"ae2998a1-1713-467e-a08e-0efd8720aa5b","card_name":"Yorvo, Lord of Garenbrig","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"aa409269-3698-42a2-8c51-75557b27a6f6","card_name":"Yoshimaru, Ever Faithful","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"1eb02f00-c188-4193-a049-d26f7643e5da","card_name":"Yotian Dissident","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"ed2ca825-b029-495f-83fc-54366229d417","card_name":"Young Wolf","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"9d795f79-c3a5-4ea1-a5cf-1ce73d6837b6","card_name":"Youthful Valkyrie","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"31572625-b4a8-4ac0-8f08-999d6a6636d7","card_name":"Yuna, Grand Summoner","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"35b613ad-86f0-431b-af93-147d21041fde","card_name":"Yuna, Hope of Spira","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"cc520518-2063-4b57-a0d4-10cf62a7175e","card_name":"Zagoth Triome","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"feeaf99b-7720-42e3-8cb1-23218b646458","card_name":"Zameck Guildmage","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"bc883e4e-e5f5-4823-ac2a-9ff8b7772926","card_name":"Zamriel, Seraph of Steel","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"881e4c00-3b9a-47a1-bf66-1badda994c88","card_name":"Zanarkand, Ancient Metropolis // Lasting Fayth","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"6dc390da-75f8-490a-a724-c12d21cfe578","card_name":"Zaxara, the Exemplary","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"93800249-4fcd-47ec-92f9-58f875cb6f00","card_name":"Zegana, Utopian Speaker","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"a5d57db6-0aa5-4e28-b156-e97b74af2cee","card_name":"Zellix, Sanity Flayer","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"1431fe83-7dc7-4c40-8d66-6525560e4323","card_name":"Zenith Chronicler","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"59cf9f4d-54cd-4cda-9726-65e16100ab46","card_name":"Zero Point Ballad","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"87b56584-8a61-40bc-99b5-7434a681fcdc","card_name":"Zethi, Arcane Blademaster","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"d481d871-d1e3-439b-bfd5-5b2212f9b0c8","card_name":"Zhalfirin Void","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"bf2af874-1052-4cad-90ed-d80e49d4c68c","card_name":"Zimone and Dina","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"7722f4f7-fe38-4107-a715-7b27b6a4e341","card_name":"Zimone, All-Questioning","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"20ccbfdd-ddae-440c-9bc0-38b15a56fdd1","card_name":"Zimone, Paradox Sculptor","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"37f10035-bf05-460d-9390-433caa2570f4","card_name":"Zoetic Cavern","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"34ad4fdb-9805-45b3-ba20-e47a15d6ff38","card_name":"Zul Ashur, Lich Lord","quantity":1,"is_commander":false,"is_sideboard":false},{"card_id":"4d987435-2403-4e0f-b19d-693da923ba50","card_name":"Zur, Eternal Schemer","quantity":1,"is_commander":false,"is_sideboard":false}];
const FAKE_USER = { id: '00000000-0000-4000-8000-000000000001' };

/* The deck list normally comes from an RPC gated on auth.uid(). */
(DeckAPI as any).getDeckSummaries = async () => [SUMMARY];
(DeckAPI as any).getDeckSummary = async () => SUMMARY;

/* Saved chats live in tables scoped to auth.uid(). Held in memory here so the
   real persistence path in Tutor.tsx is exercised end to end without a session.
   The row level security itself is proven separately, over HTTP, with the anon
   key. */
const memory: any = { tutor_conversations: [], tutor_messages: [] };

const realFrom = supabase.from.bind(supabase);
(supabase as any).from = (table: string) => {
  if (table === 'deck_cards') return thenable(DECK_CARDS);

  if (table === 'tutor_conversations' || table === 'tutor_messages') {
    const store = memory[table];
    const builder: any = {
      _filters: [] as [string, any][],
      _payload: null as any,
      select() { return builder; },
      order() { return builder; },
      limit() { return builder; },
      eq(col: string, val: any) { builder._filters.push([col, val]); return builder; },
      insert(row: any) {
        const created = {
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...row,
        };
        store.push(created);
        builder._payload = created;
        return builder;
      },
      delete() {
        builder._payload = 'delete';
        return builder;
      },
      single() {
        return Promise.resolve({ data: builder._payload, error: null });
      },
      then(resolve: any, reject: any) {
        if (builder._payload === 'delete') {
          for (const [col, val] of builder._filters) {
            for (let i = store.length - 1; i >= 0; i--) if (store[i][col] === val) store.splice(i, 1);
          }
          return Promise.resolve({ data: null, error: null }).then(resolve, reject);
        }
        if (builder._payload) return Promise.resolve({ data: builder._payload, error: null }).then(resolve, reject);
        let rows = store.slice();
        for (const [col, val] of builder._filters) rows = rows.filter((r: any) => r[col] === val);
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      },
    };
    return builder;
  }

  return realFrom(table as any);
};

function thenable(rows: any[]) {
  const b: any = {
    select: () => b, eq: () => b, in: () => b, order: () => b, limit: () => b,
    then: (resolve: any, reject: any) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
  };
  return b;
}

const realGetUser = supabase.auth.getUser.bind(supabase.auth);
(supabase.auth as any).getUser = async () => ({ data: { user: FAKE_USER }, error: null });

/* Answers are read back out of the page by the driving script. */
(window as any).__tutorMemory = memory;

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <TooltipProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={['/tutor']}>
          <Tutor />
          <Toaster position="top-center" />
        </MemoryRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);
