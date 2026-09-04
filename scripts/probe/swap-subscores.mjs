/* Which subscore moves when a staple leaves and a mediocre card arrives? */
import { readFileSync } from 'node:fs';
import { Catalog } from '../supabase/functions/deck-optimizer/catalog.ts';
import { computeDeckPower } from '../src/lib/deck/powerAdapter.ts';
const K=readFileSync('scratch/anon.txt','utf8').trim();
const H={apikey:K,Authorization:`Bearer ${K}`,'Content-Type':'application/json'};
const cat=new Catalog({url:'https://udnaflcohfyljrsgqggy.supabase.co',anonKey:K,authorization:null});

const commander=process.env.CMD ?? 'Teysa Karlov';
const g=await (await fetch('https://udnaflcohfyljrsgqggy.supabase.co/functions/v1/ai-deck-builder-v2',
  {method:'POST',headers:H,body:JSON.stringify({commander:{name:commander},powerLevel:7,includeLands:true})})).json();
const deck=g?.result?.deck; if(!deck){console.log('gen failed');process.exit(1);}

const OUT=process.argv[2]??'Smothering Tithe', IN=process.argv[3]??'Halo Fountain';
const names=[...deck.map(c=>c.name), OUT, IN, commander];
const rows=await cat.cardsByName(names,'commander');
const byName=new Map(rows.map(r=>[r.name.toLowerCase(),r]));
const toEntry=(name,qty=1,isCommander=false)=>{
  const r=byName.get(name.toLowerCase()); if(!r) return null;
  return { card:{...r, type_line:r.type_line, oracle_text:r.oracle_text}, quantity:qty, isCommander };
};
const base=[toEntry(commander,1,true),...deck.map(c=>toEntry(c.name,c.quantity||1))].filter(Boolean);
const swapped=base.filter(e=>e.card.name.toLowerCase()!==OUT.toLowerCase());
const added=toEntry(IN); if(added) swapped.push(added);

const a=computeDeckPower(base,{format:'commander'});
const b=computeDeckPower(swapped,{format:'commander'});
if(!a||!b){console.log('score failed');process.exit(1);}
console.log(`${commander}: remove ${OUT}, add ${IN}`);
console.log(`  score ${a.score} -> ${b.score}`);
const flat=x=>{const o=x.subscores??{};return Array.isArray(o)?Object.fromEntries(o.map(s=>[s.key,s.value??s.score])):
  Object.fromEntries(Object.entries(o).map(([k,v])=>[k,typeof v==='object'&&v?(v.value??v.score):v]));};
const sa=flat(a), sb=flat(b);
for(const k of Object.keys(sa)){
  const d=(sb[k]??0)-(sa[k]??0);
  if(Math.abs(d)>0.001) console.log(`  ${k.padEnd(16)} ${String(sa[k]).padStart(6)} -> ${String(sb[k]).padStart(6)}  (${d>0?'+':''}${d.toFixed(2)})`);
}
