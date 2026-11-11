import {createHash,createHmac,randomBytes,randomInt,timingSafeEqual} from 'node:crypto';
export const PILOT_OWNER='roth@recognition-direct.com';
export const PILOT_PATH='/photo-id-pilot';
export class PilotError extends Error{constructor(status,code){super(code);this.status=status;this.code=code;}}
export const fail=(status,code)=>{throw new PilotError(status,code);};
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const opaque=()=>randomBytes(16).toString('hex');
export const isId=value=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
const COOKIE='__Secure-rd_photo_pilot',AGE=8*60*60_000;
export function createPilotAuth({db,send,base,now=Date.now,testing=false}){
 if(new URL(base).protocol!=='https:'&&!testing)throw Error('PHOTO_PILOT_HTTPS_REQUIRED');
 db.exec(`CREATE TABLE IF NOT EXISTS pilot_key(id INTEGER PRIMARY KEY CHECK(id=1),secret TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS pilot_codes(id TEXT PRIMARY KEY,mac TEXT,issued INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS pilot_sessions(id TEXT PRIMARY KEY,expires INTEGER NOT NULL);`);
 db.prepare('INSERT OR IGNORE INTO pilot_key VALUES(1,?)').run(randomBytes(32).toString('hex'));
 const key=db.prepare('SELECT secret FROM pilot_key WHERE id=1').get().secret;
 const mac=value=>createHmac('sha256',key).update(value).digest('hex');
 const cookie=(raw,age)=>`${testing?'rd_photo_pilot_test':COOKIE}=${raw}; Path=${PILOT_PATH}; Max-Age=${age}; ${testing?'':'Secure; '}HttpOnly; SameSite=Strict`;
 function session(req){const name=testing?'rd_photo_pilot_test':COOKIE,raw=(req.headers.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);return typeof raw==='string'&&/^[a-f0-9]{64}$/.test(raw)?db.prepare('SELECT id,expires FROM pilot_sessions WHERE id=? AND expires>?').get(hash(raw),now()):null;}
 function requireSession(req){const s=session(req);if(!s)fail(401,'SIGN_IN_REQUIRED');return s;}
 function csrf(s){return mac('csrf:'+s.id);}
 return {
  session,requireSession,csrf,
  mutation(req){const s=requireSession(req);if(req.headers.origin!==base||req.headers['x-photo-session']!==csrf(s))fail(403,'SAME_TAB_REQUIRED');return s;},
  async request(email){
   if(typeof email!=='string'||email.trim().toLowerCase()!==PILOT_OWNER)fail(403,'OWNER_PILOT_ONLY');
   db.prepare('DELETE FROM pilot_codes WHERE issued<?').run(now()-15*60_000);
   const recent=db.prepare('SELECT COUNT(*) AS count,MAX(issued) AS latest FROM pilot_codes').get();
   if(recent.count>=5||(recent.latest&&now()-recent.latest<60_000))fail(429,'CODE_RATE_LIMIT');
   const id=opaque(),code=String(randomInt(100_000_000)).padStart(8,'0');
   db.prepare('INSERT INTO pilot_codes(id,issued) VALUES(?,?)').run(id,now());
   try{await send({to:PILOT_OWNER,subject:'Photo ID pilot | Sign-in code',text:`Your Recognition Direct photo ID pilot sign-in code is ${code}. Enter it in the private pilot. It expires in 10 minutes and works once. Do not share this code.`});}
   catch{fail(502,'CODE_DELIVERY_FAILED');}
   db.prepare('UPDATE pilot_codes SET mac=? WHERE id=?').run(mac('code:'+id+':'+code),id);
   return {challenge:id};
  },
  verify(challenge,code,prior){
   const row=isId(challenge)&&db.prepare('SELECT * FROM pilot_codes WHERE id=?').get(challenge);
   if(!row?.mac||row.issued+10*60_000<=now()||row.attempts>=5||typeof code!=='string'||!/^\d{8}$/.test(code))fail(401,'CODE_INVALID');
   db.prepare('UPDATE pilot_codes SET attempts=attempts+1 WHERE id=?').run(challenge);
   if(!timingSafeEqual(Buffer.from(row.mac),Buffer.from(mac('code:'+challenge+':'+code))))fail(401,'CODE_INVALID');
   const raw=randomBytes(32).toString('hex'),id=hash(raw);
   db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE pilot_codes SET mac=NULL WHERE id=?').run(challenge);db.prepare('DELETE FROM pilot_sessions WHERE expires<=? OR id=?').run(now(),prior?.id??'');db.prepare('INSERT INTO pilot_sessions VALUES(?,?)').run(id,now()+AGE);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
   return {session:csrf({id}),cookie:cookie(raw,AGE/1000)};
  },
  signOut(req){const s=session(req);if(s)db.prepare('DELETE FROM pilot_sessions WHERE id=?').run(s.id);return cookie('',0);}
 };
}
