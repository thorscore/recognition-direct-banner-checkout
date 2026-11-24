import {sha} from './workflow.mjs';
export function privateMailer({engines,send,owner,now=Date.now}){
 let active=null;
 for(const e of Object.values(engines)){
  e.db.exec("CREATE TABLE IF NOT EXISTS mail_status(id TEXT PRIMARY KEY,state TEXT NOT NULL,error TEXT,accepted_at INTEGER); UPDATE mail_status SET state='uncertain',error='interrupted' WHERE state='sending'");
 }
 const status=(engine,id)=>engine.db.prepare('SELECT state,error,accepted_at FROM mail_status WHERE id=?').get(id)||{state:'not-queued'};
 async function drain(){
  for(const [mode,e] of Object.entries(engines))for(const row of e.db.prepare('SELECT * FROM outbox').all()){
   const prior=status(e,row.id);if(!['not-queued','pending'].includes(prior.state))continue;
   const message=JSON.parse(row.record),job=e.job(row.job_id),pdf=e.db.prepare('SELECT * FROM proof_documents WHERE job_id=? AND revision=?').get(row.job_id,row.revision);
   if(job.proof?.revision!==row.revision||!['sent','approved'].includes(job.proof.status)){e.db.prepare('INSERT OR REPLACE INTO mail_status VALUES(?,?,?,NULL)').run(row.id,'skipped','proof-superseded');continue;}
   if(message.recipient!==owner||!message.reviewUrl||!message.text||!pdf||sha(pdf.bytes)!==message.attachment.sha256){e.db.prepare('INSERT OR REPLACE INTO mail_status VALUES(?,?,?,NULL)').run(row.id,'failed','private-message-invalid');continue;}
   await e.fresh(job);e.db.prepare('INSERT OR REPLACE INTO mail_status VALUES(?,?,NULL,NULL)').run(row.id,'sending');
   try{await send({to:owner,subject:`Recognition Direct | Private tumbler ${job.simulation?'test ':''}proof | ${job.orderName} v${row.revision}`,text:message.text,messageId:`<rd-private-tumbler-${row.id}@recognition-direct.com>`,attachments:[{filename:message.attachment.name,content:Buffer.from(pdf.bytes),contentType:'application/pdf'}]});e.db.prepare('UPDATE mail_status SET state=?,accepted_at=? WHERE id=?').run('sent',now(),row.id);}
   catch(error){const definite=['EAUTH','EENVELOPE','EDNS','ECONNECTION','ECONNREFUSED'].includes(error?.code)&&error?.command!=='DATA';e.db.prepare('UPDATE mail_status SET state=?,error=? WHERE id=?').run(definite?'failed':'uncertain',definite?'sender-not-accepted':'delivery-not-confirmed',row.id);}
  }
 }
 return {status,wake(){if(active)return active;active=drain().finally(()=>{active=null;});return active;}};
}
