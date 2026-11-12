import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createPhotoAuth,STAFF_EMAIL} from './auth.mjs';
import {hash,fail} from '../photo-id-pilot/auth.mjs';

test('Existing signed-in customers and staff remain compatible with the guest upgrade',()=>{
 const db=new DatabaseSync(':memory:'),raw='a'.repeat(64),clock=Date.now();
 try{db.exec('CREATE TABLE photo_sessions(id TEXT PRIMARY KEY,email TEXT NOT NULL,owner TEXT NOT NULL,expires INTEGER NOT NULL)');db.prepare('INSERT INTO photo_sessions VALUES(?,?,?,?)').run(hash(raw),STAFF_EMAIL,'b'.repeat(64),clock+600000);
  const auth=createPhotoAuth({db,send:async()=>{},base:'http://example.test',testing:true,now:()=>clock});const session=auth.session({headers:{cookie:'rd_photo_test='+raw}});assert.equal(session.guest,false);assert.equal(session.staff,true);assert.equal(db.prepare('PRAGMA table_info(photo_sessions)').all().length,4);
  const g=auth.guest({headers:{}});assert.equal(g.actor.staff,false);assert.equal(g.actor.email,'');assert.notEqual(g.actor.owner,session.owner);
 }finally{db.close();}
});

test('Guest issuance is bounded even when a visitor repeatedly signs out, and reuses a valid guest cookie',()=>{
 const db=new DatabaseSync(':memory:');let clock=Date.now();try{const auth=createPhotoAuth({db,send:async()=>{throw Error('Guest flow must not send mail');},base:'http://example.test',testing:true,now:()=>clock});const first=auth.guest({headers:{}}),req={headers:{cookie:first.cookie.split(';')[0]}};assert.equal(auth.guest(req).actor.owner,first.actor.owner);
  auth.signOut(req);for(let i=1;i<200;i++){const g=auth.guest({headers:{}});auth.signOut({headers:{cookie:g.cookie.split(';')[0]}});}assert.throws(()=>auth.guest({headers:{}}),e=>e.code==='GUEST_BUSY');clock+=15*60_000+1;assert.equal(auth.guest({headers:{}}).actor.guest,true);
 }finally{db.close();}
});

test('A failed optional save upgrade leaves the original guest session and code usable',async()=>{
 const db=new DatabaseSync(':memory:');let message,blocked=true;try{const auth=createPhotoAuth({db,base:'http://example.test',testing:true,send:async m=>message=m,onVerify:()=>{if(blocked)fail(507,'PILOT_JOB_LIMIT');}}),g=auth.guest({headers:{}}),req={headers:{cookie:g.cookie.split(';')[0]}},challenge=await auth.request('buyer@example.test'),code=message.text.match(/\b\d{8}\b/)[0];
  assert.throws(()=>auth.verify(challenge.challenge,code,auth.session(req)),e=>e.code==='PILOT_JOB_LIMIT');assert.equal(auth.session(req).guest,true);blocked=false;const verified=auth.verify(challenge.challenge,code,auth.session(req));assert.equal(auth.session({headers:{cookie:verified.cookie.split(';')[0]}}).guest,false);assert.equal(auth.session(req),null);
 }finally{db.close();}
});
