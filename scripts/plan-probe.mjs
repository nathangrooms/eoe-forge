/** Print the engine's plan for named commanders, read from the live catalogue. */
import { facetsForCard } from '../supabase/functions/ai-deck-builder-v2/_lib/deck/recommend/behaviour.ts';
import { planForCommander } from '../supabase/functions/ai-deck-builder-v2/_engine/knowledge/behaviour.ts';
const ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';
const names=process.argv.slice(2);
const url='https://udnaflcohfyljrsgqggy.supabase.co/rest/v1/cards_unique?select=id,name,type_line,oracle_text,tags,keywords,cmc,color_identity,edhrec_rank&name=in.('+names.map(n=>'"'+n.replace(/"/g,'\\"')+'"').join(',')+')';
const res=await fetch(url,{headers:{apikey:ANON,Authorization:`Bearer ${ANON}`}});
if(!res.ok) throw new Error(res.status+' '+await res.text());
for(const r of await res.json()){
  const f=facetsForCard(r);
  const plan=planForCommander({name:r.name,typeLine:r.type_line??null,facets:f.facets,tags:r.tags??null});
  console.log('='.repeat(80));
  console.log(r.name, '| coverage', f.coverage, '| fromTagsOnly', plan.fromTagsOnly);
  console.log('facets:', f.facets.join(' '));
  console.log('wants:');
  for(const w of plan.wants) console.log('  ', String(w.weight).padEnd(5), w.facet.padEnd(24), w.why??'');
}
