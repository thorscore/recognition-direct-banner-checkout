import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {orderProfile} from './express-one-store.mjs';

export async function createImportReviewServer(database,{port = 8792,profiles = {}} = {}) {
  if (process.env.NODE_ENV === 'production') throw new Error('This read-only account review is local only.');
  const db = new DatabaseSync(database,{readOnly:true});
  const batch = db.prepare('SELECT b.id,b.as_of,b.summary FROM import_batches b JOIN import_state s ON s.batch_id=b.id WHERE s.singleton=1').get();
  if (!batch) {db.close(); throw new Error('No staged import found.');}
  const assets = new Map([
    ['/', ['express-one-import-review.html','text/html; charset=utf-8']],
    ['/review.js',['express-one-import-review.js','application/javascript; charset=utf-8']],
    ['/review.css',['express-one-import-review.css','text/css; charset=utf-8']]
  ]);
  const contents = new Map();
  for (const [route,[name,type]] of assets) contents.set(route,{body:await readFile(new URL(`./public/${name}`,import.meta.url)),type});
  const server = createServer((req,res) => {
    const send = (status,body,type='application/json; charset=utf-8') => {
      res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"});
      res.end(typeof body === 'object' && !Buffer.isBuffer(body) ? JSON.stringify(body) : body);
    };
    if (req.headers.host !== `127.0.0.1:${server.address().port}` || !['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return send(403,{error:'Local review only.'});
    if (req.method !== 'GET') return send(405,{error:'This review cannot modify accounts or inventory.'});
    const url = new URL(req.url,'http://127.0.0.1');
    if (contents.has(url.pathname)) {const asset = contents.get(url.pathname);return send(200,asset.body,asset.type);}
    if (url.pathname === '/api/accounts') {
      const accounts = db.prepare('SELECT id,company,payload FROM account_drafts WHERE batch_id=? ORDER BY company').all(batch.id).map(row => {const account = JSON.parse(row.payload);return {id:row.id,company:row.company,styles:account.styles.length,references:account.references.length,held:account.styles.filter(style => style.importStatus === 'hold').length};});
      return send(200,{asOf:batch.as_of,summary:JSON.parse(batch.summary),accounts});
    }
    if (/^\/api\/accounts\/[a-f0-9]{24}$/.test(url.pathname)) {
      const row = db.prepare('SELECT payload FROM account_drafts WHERE batch_id=? AND id=?').get(batch.id,url.pathname.split('/').at(-1));
      if (!row) return send(404,{error:'Account not found.'});
      const account = JSON.parse(row.payload);
      if (profiles[account.id]) account.orderProfile = orderProfile(profiles[account.id]);
      return send(200,account);
    }
    return send(404,{error:'Not found.'});
  });
  server.on('close',() => db.close());
  await new Promise((resolve,reject) => {server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const {values} = parseArgs({options:{database:{type:'string'},port:{type:'string',default:'8792'},profiles:{type:'string'}}});
  if (!values.database) throw new Error('Supply the separate staging database using --database.');
  const profiles = values.profiles ? JSON.parse(await readFile(values.profiles,'utf8')):{};
  const server = await createImportReviewServer(values.database,{port:Number(values.port),profiles});
  console.log(`Private account drafts: http://127.0.0.1:${server.address().port}/`);
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal,() => server.close(() => process.exit(0)));
}
