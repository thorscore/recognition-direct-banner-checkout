import {DatabaseSync} from 'node:sqlite';
import {readFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import nodemailer from 'nodemailer';
import {alertConfig} from '../express-one-alerts.mjs';
import {PilotError,fail} from '../photo-id-pilot/auth.mjs';
import {createPhotoAuth,PATH,validEmail} from './auth.mjs';
import {createPhotoOrderStore} from './store.mjs';
import {createPhotoShopify} from './shopify.mjs';

export const VERSION='photo-id-orders-20261112.7';
export async function sendPhotoEmail(transport,from,message){if(!validEmail(message.to)||!transport)fail(503,'PILOT_EMAIL_SETUP_REQUIRED');const result=await transport.sendMail({...message,from});if(!result.accepted?.some(x=>typeof x==='string'&&x.toLowerCase()===message.to.toLowerCase()))fail(502,'PILOT_EMAIL_NOT_ACCEPTED');}
const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow, noarchive','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob: data:; font-src 'self' blob:; worker-src 'self' blob:; frame-src 'self' blob:; base-uri 'none'; frame-ancestors https://recognition-direct.com https://www.recognition-direct.com; form-action 'self'"};
const staticFiles=new Map([['/preview-follow.mjs',['preview-follow.mjs','text/javascript; charset=utf-8']],['/', ['index.html','text/html; charset=utf-8']],['/staff',['index.html','text/html; charset=utf-8']],['/app.mjs',['app.mjs','text/javascript; charset=utf-8']],['/preview-queue.mjs',['preview-queue.mjs','text/javascript; charset=utf-8']],['/payment-status.mjs',['payment-status.mjs','text/javascript; charset=utf-8']],['/proof-decision.mjs',['proof-decision.mjs','text/javascript; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']]]);
async function body(req,max=256*1024){const chunks=[];let n=0;if(req.headers['content-encoding'])fail(415,'ENCODING_UNSUPPORTED');for await(const c of req.iterator({destroyOnReturn:false})){n+=c.length;if(n>max){req.resume();fail(413,'FILE_TOO_LARGE');}chunks.push(c);}return Buffer.concat(chunks);}
async function json(req){if(!req.headers['content-type']?.startsWith('application/json'))fail(415,'JSON_REQUIRED');try{return JSON.parse((await body(req)).toString());}catch(e){if(e instanceof PilotError)throw e;fail(422,'REQUEST_INVALID');}}
export async function configurePhotoOrders({databasePath,base,env=process.env,testing=false,send:providedSend,shopify:providedShopify,graphql,shop,now=Date.now}){
 base=new URL(base).origin;await mkdir(dirname(databasePath),{recursive:true});const db=new DatabaseSync(databasePath);
 const config=alertConfig({...env,EXPRESS_ONE_EMAIL_ENABLED:'true'},false);
 const transport=config.enabled?nodemailer.createTransport(config.smtp):null;
 const send=providedSend??(message=>sendPhotoEmail(transport,config.from,message));
 const shopify=providedShopify??createPhotoShopify({graphql,shop,base});
 const store=createPhotoOrderStore({db,send,shopify,base,now,storageRoot:databasePath===':memory:'?undefined:dirname(databasePath)}),auth=createPhotoAuth({db,send,base,testing,now,onVerify:(prior,actor)=>store.claimGuest(prior,actor)});

 function output(res,status,value,type='application/json; charset=utf-8',extra={}){res.writeHead(status,{...headers,'Content-Type':type,...extra});res.end(Buffer.isBuffer(value)?value:JSON.stringify(value));}
 function pdf(res,bytes,name){output(res,200,bytes,'application/pdf',{'Content-Disposition':`inline; filename="${name}.pdf"`});}
 return {close(){transport?.close();db.close();},async handle(req,res,url){
  if(url.pathname!==PATH&&!url.pathname.startsWith(PATH+'/'))return false;
  const path=url.pathname.slice(PATH.length)||'/';
  try{
   if(req.method==='GET'&&path==='/health'){output(res,200,{ok:true,version:VERSION,liveStore:true,emailConfigured:!!providedSend||config.enabled,checkoutConfigured:shopify.configured});return true;}
   if(req.method==='GET'&&staticFiles.has(path)){const [file,type]=staticFiles.get(path);output(res,200,await readFile(new URL('./public/'+file,import.meta.url)),type);return true;}
   if(!path.startsWith('/api/'))fail(404,'NOT_FOUND');
   if(req.method==='POST'&&path==='/api/guest'){if(req.headers.origin!==base)fail(403,'SAME_TAB_REQUIRED');await json(req);const guest=auth.guest(req);output(res,200,{ok:true},'application/json; charset=utf-8',guest.cookie?{'Set-Cookie':guest.cookie}:{});return true;}
   if(req.method==='POST'&&['/api/code','/api/verify'].includes(path)){
    if(req.headers.origin!==base)fail(403,'SAME_TAB_REQUIRED');const data=await json(req);
    if(path==='/api/code')output(res,200,await auth.request(data.email));
    else{const verified=auth.verify(data.challenge,data.code,auth.session(req));output(res,200,{ok:true},'application/json; charset=utf-8',{'Set-Cookie':verified.cookie});}return true;
   }
   const s=req.method==='GET'?auth.requireSession(req):auth.mutation(req);
   if(req.method==='GET'&&path==='/api/session'){output(res,200,{owner:s.email,guest:s.guest,staff:s.staff,session:auth.csrf(s),version:VERSION,checkoutConfigured:shopify.configured,emailConfigured:!!providedSend||config.enabled});return true;}
   if(req.method==='POST'&&path==='/api/sign-out'){output(res,200,{ok:true},'application/json; charset=utf-8',{'Set-Cookie':auth.signOut(req)});return true;}
   if(path==='/api/jobs'&&req.method==='GET'){output(res,200,store.list(s,{ownOnly:url.searchParams.get('view')==='designer'}));return true;}
   if(path==='/api/jobs'&&req.method==='POST'){await json(req);output(res,201,store.create(s));return true;}
   const match=path.match(/^\/api\/jobs\/([a-f0-9]{32})(?:\/(assets|preview|checkout|sync|prepare-proof|production\.pdf|events|reorder))?$/);
   if(match){const [,id,action]=match;
    if(req.method==='GET'&&!action)output(res,200,store.read(s,id));
    else if(req.method==='GET'&&action==='events')output(res,200,store.eventRows(s,id));
    else if(req.method==='GET'&&action==='production.pdf')pdf(res,await store.production(s,id),'photo-id-'+id.slice(0,12)+'-production');
    else if(req.method==='POST'&&action==='assets'){let filename;try{filename=decodeURIComponent(req.headers['x-photo-filename']??'');}catch{fail(422,'ARTWORK_FILE_INVALID');}output(res,201,await store.upload(s,id,{role:req.headers['x-photo-role'],type:req.headers['content-type'],filename,bytes:await body(req,10*1024*1024)}));}
    else if(req.method==='POST'){
     const data=await json(req);
     if(!action)output(res,200,store.save(s,id,data));
     else if(action==='preview')pdf(res,await store.preview(s,id,data.document,{personIndex:data.personIndex}),'photo-id-preview');
     else if(action==='checkout')output(res,200,await store.checkout(s,id,data));
     else if(action==='reorder')output(res,201,store.reorder(s,id));
     else if(action==='sync')output(res,200,await store.sync(s,id));
     else if(action==='prepare-proof')output(res,200,await store.prepareProof(s,id));
     else fail(405,'METHOD_NOT_ALLOWED');
    }else fail(405,'METHOD_NOT_ALLOWED');return true;
   }
   const asset=path.match(/^\/api\/assets\/([a-f0-9]{32})$/);if(asset&&req.method==='GET'){output(res,200,store.image(s,asset[1]),'image/png');return true;}
   const original=path.match(/^\/api\/assets\/([a-f0-9]{32})\/original$/);if(original&&req.method==='GET'){const file=store.original(s,original[1]);output(res,200,file.bytes,file.type,{'Content-Disposition':`attachment; filename="${file.filename}"`,'Content-Security-Policy':"default-src 'none'; sandbox"});return true;}
   const proof=path.match(/^\/api\/proofs\/([a-f0-9]{32})(?:\/(pdf|send|decision))?$/);
   if(proof){const [,id,action]=proof;if(req.method==='GET'&&!action)output(res,200,store.proof(s,id));else if(req.method==='GET'&&action==='pdf')pdf(res,store.proofPdf(s,id),'photo-id-proof-'+id.slice(0,12));else if(req.method==='POST'&&action==='send')output(res,200,await store.sendProof(s,id,await json(req)));else if(req.method==='POST'&&action==='decision')output(res,200,await store.decide(s,id,await json(req)));else fail(405,'METHOD_NOT_ALLOWED');return true;}
   fail(404,'NOT_FOUND');
  }catch(e){if(res.headersSent){res.end();return true;}output(res,e instanceof PilotError?e.status:500,{error:e instanceof PilotError?e.code:'PILOT_REQUEST_FAILED'});return true;}
 }};
}
