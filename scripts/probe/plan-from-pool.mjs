import { readFileSync } from 'node:fs';
import { Catalog } from '../supabase/functions/deck-optimizer/catalog.ts';
import { planForCommander } from '../src/engine/knowledge/behaviour.ts';
const K=readFileSync('scratch/anon.txt','utf8').trim();
const c=new Catalog({url:'https://udnaflcohfyljrsgqggy.supabase.co',anonKey:K,authorization:null});
for(const name of process.argv.slice(2)){
  const [row]=await c.cardsByName([name],'commander');
  const f=(await c.poolFacetsByName([name])).get(row.name)??[];
  const plan=planForCommander({name:row.name,typeLine:row.type_line,facets:f,tags:row.tags??[],
    oracleText:row.oracle_text??null,faces:row.faces??null});
  console.log(`\n${name}\n  pool facets include eff:reduce-cost: ${f.includes('eff:reduce-cost')}`);
  for(const w of plan.wants.slice(0,10)) console.log(`  ${w.weight.toFixed(2)}  ${w.facet}`);
}
