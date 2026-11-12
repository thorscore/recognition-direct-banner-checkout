import {createHmac,randomBytes,randomInt,timingSafeEqual} from 'node:crypto';
import {fail,hash,opaque,isId,PILOT_OWNER} from '../photo-id-pilot/auth.mjs';
export const PATH='/photo-id',STAFF_EMAIL=PILOT_OWNER;
const AGE=8*60*60_000;
export function validEmail(value){return typeof value==='string'&&value.length<=254&&/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,63}$/.test(value);}
export function createPhotoAuth({db,send,base,testing=false,now=Date.now}){
 if(new URL(base).protocol!=='https:'&&!testing)throw Error('PHOTO_HTTPS_REQUIRED');
 db.exec(`CREATE TABLE IF NOT EXISTS photo_key(id INTEGER PRIMARY KEY CHECK(id=1),secret TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS photo_codes(id TEXT PRIMARY KEY,email TEXT NOT NULL,mac TEXT,issued INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS photo_sessions(id TEXT PRIMARY KEY,email TEXT NOT NULL,owner TEXT NOT NULL,expires INTEGER NOT NULL);`);
 db.prepare('INSERT OR IGNORE INTO photo_key VALUES(1,?)').run(randomBytes(32).toString('hex'));
 const key=db.prepare('SELECT secret FROM photo_key WHERE id=1').get().secret,mac=value=>createHmac('sha256',key).update(value).digest('hex');
 const cookieName=testing?'rd_photo_test':'__Secure-rd_photo_orders';
 const cookie=(raw,seconds)=>`${cookieName}=${raw}; Path=${PATH}; Max-Age=${seconds}; ${testing?'':'Secure; '}HttpOnly; SameSite=Strict`;
 function session(req){const raw=(req.headers.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);const row=/^[a-f0-9]{64}$/.test(raw??'')&&db.prepare('SELECT * FROM photo_sessions WHERE id=? AND expires>?').get(hash(raw),now());return row?{...row,staff:row.email===STAFF_EMAIL}:null;}
 function requireSession(req){const actor=session(req);if(!actor)fail(401,'SIGN_IN_REQUIRED');return actor;}
 const csrf=actor=>mac('csrf:'+actor.id);
 return {
  session,requireSession,csrf,
  mutation(req){const actor=requireSession(req);if(req.headers.origin!==base||req.headers['x-photo-session']!==csrf(actor))fail(403,'SAME_TAB_REQUIRED');return actor;},
  async request(value){
   const email=typeof value==='string'?value.trim().toLowerCase():'';if(!validEmail(email))fail(422,'EMAIL_INVALID');
   db.prepare('DELETE FROM photo_codes WHERE issued<?').run(now()-15*60_000);
   const recent=db.prepare('SELECT COUNT(*) AS n,MAX(issued) AS latest FROM photo_codes WHERE email=?').get(email),total=db.prepare('SELECT COUNT(*) AS n FROM photo_codes').get().n;
   if(recent.n>=3||(recent.latest&&now()-recent.latest<60_000)||total>=40)fail(429,'CODE_RATE_LIMIT');
   const id=opaque(),code=String(randomInt(100_000_000)).padStart(8,'0');db.prepare('INSERT INTO photo_codes(id,email,issued) VALUES(?,?,?)').run(id,email,now());
   try{await send({to:email,subject:'Recognition Direct | Photo ID sign-in code',text:`Your Recognition Direct Photo ID sign-in code is ${code}. It expires in 10 minutes and works once. Use it to open your private designs, order badges or review your proof. No Shopify account or password is required. If you did not request it, you can ignore this email.`});}catch{fail(502,'CODE_DELIVERY_FAILED');}
   db.prepare('UPDATE photo_codes SET mac=? WHERE id=?').run(mac('code:'+id+':'+code),id);return {challenge:id};
  },
  verify(challenge,code,prior){
   const row=isId(challenge)&&db.prepare('SELECT * FROM photo_codes WHERE id=?').get(challenge);
   if(!row?.mac||row.issued+600_000<=now()||row.attempts>=5||typeof code!=='string'||!/^\d{8}$/.test(code))fail(401,'CODE_INVALID');
   db.prepare('UPDATE photo_codes SET attempts=attempts+1 WHERE id=?').run(challenge);if(!timingSafeEqual(Buffer.from(row.mac),Buffer.from(mac('code:'+challenge+':'+code))))fail(401,'CODE_INVALID');
   const raw=randomBytes(32).toString('hex'),id=hash(raw);db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE photo_codes SET mac=NULL WHERE id=?').run(challenge);db.prepare('DELETE FROM photo_sessions WHERE expires<=? OR id=?').run(now(),prior?.id??'');db.prepare('INSERT INTO photo_sessions VALUES(?,?,?,?)').run(id,row.email,mac('owner:'+row.email),now()+AGE);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
   return {cookie:cookie(raw,AGE/1000)};
  },
  signOut(req){const actor=session(req);if(actor)db.prepare('DELETE FROM photo_sessions WHERE id=?').run(actor.id);return cookie('',0);}
 };
}
