/* Does the (rank, id) keyset walk return every row exactly once?
   A cursor that skips or repeats is silent: the pool is simply smaller and
   nothing downstream can tell. */
const U='https://udnaflcohfyljrsgqggy.supabase.co';
const K='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';
const h={apikey:K,Authorization:'Bearer '+K};

async function walk(identity){
  const id=encodeURIComponent(`{${identity.join(',')}}`);
  const base=`${U}/rest/v1/cards_pool?select=id,edhrec_rank&commander_legal=eq.legal&color_identity=cd.${id}&edhrec_rank=not.is.null`;
  const seen=new Set(); const dupes=[];
  let after=null, pages=0;
  for(;;){
    let url=base+'&order=edhrec_rank.asc,id.asc';
    if(after) url+=`&or=(edhrec_rank.gt.${after.rank},and(edhrec_rank.eq.${after.rank},id.gt.${encodeURIComponent(after.id)}))`;
    const r=await fetch(url,{headers:{...h,Range:'0-999','Range-Unit':'items'}});
    const rows=await r.json();
    if(!Array.isArray(rows)){ console.log('  query failed:',JSON.stringify(rows).slice(0,140)); return null; }
    pages++;
    for(const row of rows){ if(seen.has(row.id)) dupes.push(row.id); seen.add(row.id); }
    if(rows.length<1000) break;
    const last=rows[rows.length-1];
    after={rank:last.edhrec_rank,id:last.id};
    if(pages>60) { console.log('  runaway'); break; }
  }
  return {walked:seen.size,pages,dupes:dupes.length};
}

async function truth(identity){
  const id=encodeURIComponent(`{${identity.join(',')}}`);
  const r=await fetch(`${U}/rest/v1/cards_pool?select=id&commander_legal=eq.legal&color_identity=cd.${id}&edhrec_rank=not.is.null`,
    {headers:{...h,Prefer:'count=exact',Range:'0-0'}});
  const cr=r.headers.get('content-range')||'';
  return Number(cr.split('/')[1]||NaN);
}

for(const identity of [['R'],['B','W'],['B','G','R','U','W']]){
  const label=identity.join('')||'C';
  const expected=await truth(identity);
  const got=await walk(identity);
  if(!got){ console.log(label,'walk failed'); continue; }
  const ok = got.walked===expected && got.dupes===0;
  console.log(`${label.padEnd(6)} expected ${String(expected).padStart(6)}  walked ${String(got.walked).padStart(6)}  pages ${String(got.pages).padStart(3)}  duplicates ${got.dupes}   ${ok?'OK':'MISMATCH'}`);
}
