import {DatabaseSync} from 'node:sqlite';
import {readFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import nodemailer from 'nodemailer';
import {alertConfig} from '../express-one-alerts.mjs';
import {createPilotAuth,PILOT_OWNER,PILOT_PATH,PilotError,fail} from './auth.mjs';
import {createPilotStore} from './store.mjs';
import {createPhotoPilotShopify} from './shopify.mjs';
import {createPilotSamples} from './samples.mjs';
export const VERSION='photo-id-private-pilot-20261112.6';
const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow, noarchive','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob: data:; font-src 'self' blob:; worker-src 'self' blob:; frame-src 'self' blob:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"};
const staticFiles=new Map([['/', ['index.html','text/html; charset=utf-8']],['/app.mjs',['app.mjs','text/javascript; charset=utf-8']],['/payment-status.mjs',['payment-status.mjs','text/javascript; charset=utf-8']],['/proof-decision.mjs',['proof-decision.mjs','text/javascript; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']]]);
async function body(req,max=256*1024){const chunks=[];let n=0;if(req.headers['content-encoding'])fail(415,'ENCODING_UNSUPPORTED');for await(const c of req){n+=c.length;if(n>max)fail(413,'FILE_TOO_LARGE');chunks.push(c);}return Buffer.concat(chunks);}
async function json(req){if(!req.headers['content-type']?.startsWith('application/json'))fail(415,'JSON_REQUIRED');try{return JSON.parse((await body(req)).toString());}catch(e){if(e instanceof PilotError)throw e;fail(422,'REQUEST_INVALID');}}
export async function configurePhotoIdPilot({databasePath,base,env=process.env,testing=false,send:providedSend,shopify:providedShopify}){
 base=new URL(base).origin;await mkdir(dirname(databasePath),{recursive:true});const db=new DatabaseSync(databasePath);
 const config=alertConfig({...env,EXPRESS_ONE_EMAIL_ENABLED:'true'},false);
 const transport=config.enabled?nodemailer.createTransport(config.smtp):null;
 const send=providedSend??(async message=>{if(message.to!==PILOT_OWNER||!transport)fail(503,'PILOT_EMAIL_SETUP_REQUIRED');const result=await transport.sendMail({...message,from:config.from});if(!result.accepted?.some(x=>typeof x==='string'&&x.toLowerCase()===PILOT_OWNER))fail(502,'PILOT_EMAIL_NOT_ACCEPTED');});
 const shopify=providedShopify??createPhotoPilotShopify({secret:env.PHOTO_ID_PILOT_SHOPIFY_SECRET});
 const auth=createPilotAuth({db,send,base,testing}),store=createPilotStore({db,send,shopify,base});
 const sample=createPilotSamples(store);
 function output(res,status,value,type='application/json; charset=utf-8',extra={}){res.writeHead(status,{...headers,'Content-Type':type,...extra});res.end(Buffer.isBuffer(value)?value:JSON.stringify(value));}
 function pdf(res,bytes,name){output(res,200,bytes,'application/pdf',{'Content-Disposition':`inline; filename="${name}.pdf"`});}
 return {close(){transport?.close();db.close();},async handle(req,res,url){
  if(url.pathname!==PILOT_PATH&&!url.pathname.startsWith(PILOT_PATH+'/'))return false;
  const path=url.pathname.slice(PILOT_PATH.length)||'/';
  try{
   if(req.method==='GET'&&path==='/health'){output(res,200,{ok:true,version:VERSION,privatePilot:true});return true;}
   if(req.method==='GET'&&staticFiles.has(path)){const [file,type]=staticFiles.get(path);output(res,200,await readFile(new URL('./public/'+file,import.meta.url)),type);return true;}
   if(!path.startsWith('/api/'))fail(404,'NOT_FOUND');
   if(req.method==='POST'&&['/api/code','/api/verify'].includes(path)){
    if(req.headers.origin!==base)fail(403,'SAME_TAB_REQUIRED');const data=await json(req);
    if(path==='/api/code')output(res,200,await auth.request(data.email));
    else{const verified=auth.verify(data.challenge,data.code,auth.session(req));output(res,200,{session:verified.session,owner:PILOT_OWNER},'application/json; charset=utf-8',{'Set-Cookie':verified.cookie});}return true;
   }
   const s=req.method==='GET'?auth.requireSession(req):auth.mutation(req);
   if(req.method==='GET'&&path==='/api/session'){output(res,200,{owner:PILOT_OWNER,session:auth.csrf(s),version:VERSION,checkoutConfigured:shopify.configured,emailConfigured:!!providedSend||config.enabled});return true;}
   if(req.method==='POST'&&path==='/api/sign-out'){output(res,200,{ok:true},'application/json; charset=utf-8',{'Set-Cookie':auth.signOut(req)});return true;}
   if(path==='/api/jobs'&&req.method==='GET'){output(res,200,store.list());return true;}
   if(path==='/api/jobs'&&req.method==='POST'){await json(req);output(res,201,store.create());return true;}
   if(path==='/api/samples'&&req.method==='POST'){const data=await json(req);output(res,200,await sample(data.side));return true;}
   const match=path.match(/^\/api\/jobs\/([a-f0-9]{32})(?:\/(assets|preview|checkout|sync|prepare-proof|production\.pdf|events))?$/);
   if(match){const [,id,action]=match;
    if(req.method==='GET'&&!action)output(res,200,store.read(id));
    else if(req.method==='GET'&&action==='events')output(res,200,store.eventRows(id));
    else if(req.method==='GET'&&action==='production.pdf')pdf(res,await store.production(id),'photo-id-'+id.slice(0,12)+'-production-test');
    else if(req.method==='POST'&&action==='assets'){let filename;try{filename=decodeURIComponent(req.headers['x-photo-filename']??'');}catch{fail(422,'ARTWORK_FILE_INVALID');}output(res,201,await store.upload(id,{role:req.headers['x-photo-role'],type:req.headers['content-type'],filename,bytes:await body(req,10*1024*1024)}));}
    else if(req.method==='POST'){
     const data=await json(req);
     if(!action)output(res,200,store.save(id,data));
     else if(action==='preview')pdf(res,await store.preview(id,data.document),'photo-id-preview');
     else if(action==='checkout')output(res,200,await store.checkout(id,data));
     else if(action==='sync')output(res,200,await store.sync(id));
     else if(action==='prepare-proof')output(res,200,await store.prepareProof(id));
     else fail(405,'METHOD_NOT_ALLOWED');
    }else fail(405,'METHOD_NOT_ALLOWED');return true;
   }
   const asset=path.match(/^\/api\/assets\/([a-f0-9]{32})$/);if(asset&&req.method==='GET'){output(res,200,store.image(asset[1]),'image/png');return true;}
   const original=path.match(/^\/api\/assets\/([a-f0-9]{32})\/original$/);if(original&&req.method==='GET'){const file=store.original(original[1]);output(res,200,file.bytes,file.type,{'Content-Disposition':`attachment; filename="${file.filename}"`,'Content-Security-Policy':"default-src 'none'; sandbox"});return true;}
   const proof=path.match(/^\/api\/proofs\/([a-f0-9]{32})(?:\/(pdf|send|decision))?$/);
   if(proof){const [,id,action]=proof;if(req.method==='GET'&&!action)output(res,200,store.proof(id));else if(req.method==='GET'&&action==='pdf')pdf(res,store.proofPdf(id),'photo-id-proof-'+id.slice(0,12));else if(req.method==='POST'&&action==='send')output(res,200,await store.sendProof(id,await json(req)));else if(req.method==='POST'&&action==='decision')output(res,200,await store.decide(id,await json(req)));else fail(405,'METHOD_NOT_ALLOWED');return true;}
   fail(404,'NOT_FOUND');
  }catch(e){if(res.headersSent){res.end();return true;}output(res,e instanceof PilotError?e.status:500,{error:e instanceof PilotError?e.code:'PILOT_REQUEST_FAILED'});return true;}
 }};
}
