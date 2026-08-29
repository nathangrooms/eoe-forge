import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve('dist');
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2','.ico':'image/x-icon'};
http.createServer((req,res)=>{
  const u = new URL(req.url,'http://x');
  let f = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    if (/\.[a-z0-9]+$/i.test(u.pathname) && !u.pathname.endsWith('.html')) { res.writeHead(404); return res.end('not found'); }
    f = path.join(ROOT,'index.html');
  }
  res.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});
  fs.createReadStream(f).pipe(res);
}).listen(4178, ()=>console.log('dist on http://127.0.0.1:4178'));
