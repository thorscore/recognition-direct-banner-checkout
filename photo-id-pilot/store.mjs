import {normalizeArtwork} from './artwork.mjs';
import {opaque,isId,hash,fail,PILOT_OWNER} from './auth.mjs';
import {checkDocument,newDocument,documentAssets,financialSignature} from './document.mjs';
import {cardPdf,proofPdf} from './pdf.mjs';
const MAX_STORAGE=128*1024*1024;
export function createPilotStore({db,shopify,send,base,now=Date.now,pdfs={cardPdf,proofPdf}}){
 db.exec(`PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS photo_pilot_jobs(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,document TEXT NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS photo_pilot_assets(id TEXT PRIMARY KEY,job_id TEXT NOT NULL,role TEXT NOT NULL,type TEXT NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,source BLOB NOT NULL,normalized BLOB NOT NULL,preview BLOB NOT NULL,source_hash TEXT NOT NULL,normalized_hash TEXT NOT NULL,FOREIGN KEY(job_id) REFERENCES photo_pilot_jobs(id));
 CREATE TABLE IF NOT EXISTS photo_pilot_runs(id TEXT PRIMARY KEY,job_id TEXT NOT NULL UNIQUE,side TEXT NOT NULL UNIQUE,record TEXT NOT NULL,status TEXT NOT NULL,error_code TEXT,draft_id TEXT UNIQUE,checkout_url TEXT,paid TEXT,FOREIGN KEY(job_id) REFERENCES photo_pilot_jobs(id));
 CREATE TABLE IF NOT EXISTS photo_pilot_proofs(id TEXT PRIMARY KEY,job_id TEXT NOT NULL,revision INTEGER NOT NULL,document_hash TEXT NOT NULL,document TEXT NOT NULL,pdf BLOB NOT NULL,pdf_hash TEXT NOT NULL,status TEXT NOT NULL,message_id TEXT,decision TEXT,decided INTEGER,UNIQUE(job_id,revision),FOREIGN KEY(job_id) REFERENCES photo_pilot_jobs(id));
 CREATE TABLE IF NOT EXISTS photo_pilot_events(id TEXT PRIMARY KEY,job_id TEXT NOT NULL,proof_id TEXT,event TEXT NOT NULL,at INTEGER NOT NULL,detail TEXT NOT NULL);`);
 if(!db.prepare('PRAGMA table_info(photo_pilot_assets)').all().some(c=>c.name==='filename'))db.exec("ALTER TABLE photo_pilot_assets ADD COLUMN filename TEXT NOT NULL DEFAULT ''");
 db.prepare("UPDATE photo_pilot_proofs SET status='email-uncertain' WHERE status='sending'").run();
 db.prepare("UPDATE photo_pilot_runs SET status='needs-review',error_code='INTERRUPTED_CHECKOUT_REVIEW' WHERE status IN ('preflight','creating','verifying')").run();
 function event(job,kind,detail={},proof=null){db.prepare('INSERT INTO photo_pilot_events VALUES(?,?,?,?,?,?)').run(opaque(),job,proof,kind,now(),JSON.stringify(detail));}
 function job(id){const row=isId(id)&&db.prepare('SELECT * FROM photo_pilot_jobs WHERE id=?').get(id);if(!row)fail(404,'BADGE_JOB_NOT_FOUND');return {...row,document:JSON.parse(row.document)};}
 function run(id){const row=db.prepare('SELECT * FROM photo_pilot_runs WHERE job_id=?').get(id);return row?{...row,record:JSON.parse(row.record),paid:row.paid?JSON.parse(row.paid):null}:null;}
 function proofRow(id){const row=isId(id)&&db.prepare('SELECT * FROM photo_pilot_proofs WHERE id=?').get(id);if(!row)fail(404,'PROOF_NOT_FOUND');return row;}
 function assetsFor(j,document=j.document,{display=false}={}){const map=new Map();for(const id of new Set(documentAssets(document))){
  const row=db.prepare('SELECT * FROM photo_pilot_assets WHERE id=? AND job_id=?').get(id,j.id);const role=id===document.logo?'logo':id===document.backArtwork?'back':'portrait';if(!row||row.role!==role||hash(row.normalized)!==row.normalized_hash||hash(row.source)!==row.source_hash)fail(409,'ARTWORK_NEEDS_REVIEW');map.set(id,display?{width:row.width,height:row.height,normalized:Buffer.from(row.preview)}:{...row,normalized:Buffer.from(row.normalized)});
 }return map;}
 function publicProof(p,j){return {id:p.id,revision:p.revision,pdfHash:p.pdf_hash,status:p.status,decision:p.decision,decided:p.decided,superseded:p.revision!==j.revision||p.document_hash!==hash(JSON.stringify(j.document)),pdfUrl:base+'/photo-id-pilot/api/proofs/'+p.id+'/pdf'};}
 function view(j){const r=run(j.id),proofs=db.prepare('SELECT id,revision,document_hash,pdf_hash,status,decision,decided FROM photo_pilot_proofs WHERE job_id=? ORDER BY revision DESC').all(j.id);return {id:j.id,revision:j.revision,document:j.document,price:checkDocument(j.document).price,checkout:r?{status:r.status,error:r.error_code,url:r.checkout_url,paid:!!r.paid,orderName:r.paid?.orderName,totalCents:r.paid?.totalCents}:null,proofs:proofs.map(p=>publicProof(p,j)),productionReleased:false,productionReleaseSupported:false};}
 async function reconcile(j,r){try{const result=await shopify.read({...r.record,draftId:r.draft_id,checkoutUrl:r.checkout_url});db.prepare('UPDATE photo_pilot_runs SET status=?,checkout_url=?,paid=?,error_code=NULL WHERE id=?').run(result.paid?'paid':'checkout-ready',result.checkoutUrl,result.paid?JSON.stringify(result):null,r.id);event(j.id,result.paid?'test-payment-verified':'checkout-verified',{draftId:r.draft_id});return result;}catch(e){db.prepare('UPDATE photo_pilot_runs SET status=?,error_code=? WHERE id=?').run('needs-review',e.code??'TEST_STORE_CONNECTION_FAILED',r.id);throw e;}}
 return {
  list(){return db.prepare('SELECT id,revision,updated FROM photo_pilot_jobs ORDER BY updated DESC').all().map(row=>view(job(row.id)));},
  create(){if(db.prepare('SELECT COUNT(*) AS count FROM photo_pilot_jobs').get().count>=12)fail(507,'PILOT_JOB_LIMIT');const id=opaque(),document=newDocument();db.prepare('INSERT INTO photo_pilot_jobs VALUES(?,?,?,?,?)').run(id,1,JSON.stringify(document),now(),now());event(id,'draft-created');return view(job(id));},
  read(id){return view(job(id));},
  async upload(id,{role,type,bytes,filename=''}){
   const j=job(id);if(typeof filename!=='string'||filename.length>180||/[\u0000-\u001f\u007f\\/]/.test(filename))fail(422,'ARTWORK_FILE_INVALID');
   const {normalized,preview,width,height,type:sourceType,previewKind}=await normalizeArtwork({role,type,bytes,filename});
   db.exec('BEGIN IMMEDIATE');try{job(id);const usage=db.prepare('SELECT COALESCE(SUM(length(source)+length(normalized)+length(preview)),0) AS bytes FROM photo_pilot_assets').get().bytes;if(usage+bytes.length+normalized.length+preview.length>MAX_STORAGE)fail(507,'PILOT_STORAGE_FULL');const asset=opaque();db.prepare('INSERT INTO photo_pilot_assets(id,job_id,role,type,width,height,source,normalized,preview,source_hash,normalized_hash,filename) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(asset,j.id,role,sourceType,width,height,bytes,normalized,preview,hash(bytes),hash(normalized),filename);db.exec('COMMIT');return {id:asset,width,height,previewKind,previewUrl:base+'/photo-id-pilot/api/assets/'+asset,originalUrl:base+'/photo-id-pilot/api/assets/'+asset+'/original'};}catch(e){db.exec('ROLLBACK');throw e;}
  },
  original(id){const row=isId(id)&&db.prepare('SELECT type,source,source_hash,filename FROM photo_pilot_assets WHERE id=?').get(id);if(!row||hash(row.source)!==row.source_hash)fail(404,'ARTWORK_NOT_FOUND');const extension=/\.ai$/i.test(row.filename)?'ai':({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/svg+xml':'svg','application/pdf':'pdf'}[row.type]??'bin');return {bytes:Buffer.from(row.source),type:row.type,filename:'photo-id-original-'+id.slice(0,12)+'.'+extension};},
  image(id){const row=isId(id)&&db.prepare('SELECT preview FROM photo_pilot_assets WHERE id=?').get(id);if(!row)fail(404,'ARTWORK_NOT_FOUND');return Buffer.from(row.preview);},
  save(id,{expectedRevision,document}){
   const j=job(id);if(j.revision!==expectedRevision)fail(409,'DRAFT_CHANGED_RELOAD');const checked=checkDocument(document);assetsFor(j,checked.document);const r=run(id);if(r&&financialSignature(checked.document)!==financialSignature(JSON.parse(r.record.document)))fail(409,'CHECKOUT_OPTIONS_LOCKED');
   if(JSON.stringify(checked.document)===JSON.stringify(j.document))return view(j);
   const result=db.prepare('UPDATE photo_pilot_jobs SET revision=revision+1,document=?,updated=? WHERE id=? AND revision=?').run(JSON.stringify(checked.document),now(),id,expectedRevision);if(!result.changes)fail(409,'DRAFT_CHANGED_RELOAD');event(id,'design-revision-saved');return view(job(id));
  },
  async preview(id,document,{personIndex}={}){
   const j=job(id),checked=checkDocument(document);
   if(personIndex!==undefined&&(!Number.isSafeInteger(personIndex)||personIndex<0||personIndex>=checked.document.people.length))fail(422,'PREVIEW_PERSON_INVALID');
   const visible=personIndex===undefined?checked.document:{...checked.document,people:[checked.document.people[personIndex]]};
   // The 900px display images preserve source coordinates and transparency.
   // Checkout, proofs, originals and production continue to use full artwork.
   const assets=assetsFor(j,visible,{display:true});
   return pdfs.cardPdf(visible,assets,{guide:true,title:'Photo ID pilot preview'});
  },
  async checkout(id,{expectedRevision,fictionalDataConfirmed}){
   const j=job(id);if(expectedRevision!==j.revision)fail(409,'DRAFT_CHANGED_RELOAD');if(fictionalDataConfirmed!==true)fail(422,'PILOT_CONFIRMATION_REQUIRED');const checked=checkDocument(j.document,{complete:true}),assets=assetsFor(j);await pdfs.cardPdf(j.document,assets,{guide:true});
   let existing=run(id);if(existing?.checkout_url)return view(j);if(existing&&existing.status!=='not-created')fail(409,'CHECKOUT_NEEDS_STATUS_CHECK');
   if(!shopify.configured)fail(503,'TEST_CHECKOUT_SETUP_REQUIRED');
   const record={id:existing?.id??opaque(),side:j.document.printSides,delivery:j.document.delivery,quantity:checked.price.quantity,unitCents:checked.price.unitCents,subtotalCents:checked.price.subtotalCents,document:JSON.stringify(j.document),revision:j.revision,assetHashes:[...assets.values()].map(a=>[a.id,a.source_hash,a.normalized_hash])};
   try{if(existing)db.prepare('UPDATE photo_pilot_runs SET record=?,status=?,error_code=NULL WHERE id=?').run(JSON.stringify(record),'preflight',record.id);else db.prepare('INSERT INTO photo_pilot_runs(id,job_id,side,record,status) VALUES(?,?,?,?,?)').run(record.id,id,record.side,JSON.stringify(record),'preflight');}catch{fail(409,'PILOT_SIDE_ALREADY_HAS_CHECKOUT');}
   try{record.pickup=await shopify.preflight(record);}catch(e){db.prepare('UPDATE photo_pilot_runs SET status=?,error_code=? WHERE id=?').run('not-created',e.code??'TEST_STORE_CONNECTION_FAILED',record.id);throw e;}
   db.prepare('UPDATE photo_pilot_runs SET status=?,record=? WHERE id=?').run('creating',JSON.stringify(record),record.id);
   let draftId;try{draftId=await shopify.create(record);}catch(e){db.prepare('UPDATE photo_pilot_runs SET status=?,error_code=?,draft_id=? WHERE id=?').run(e.code==='TEST_DRAFT_REJECTED'&&!e.draftId?'not-created':'needs-review',e.code??'CREATE_RESULT_UNCERTAIN',e.draftId??null,record.id);throw e;}
   db.prepare('UPDATE photo_pilot_runs SET draft_id=?,status=? WHERE id=?').run(draftId,'verifying',record.id);event(id,'test-draft-created',{draftId});
   await reconcile(j,run(id));return view(job(id));
  },
  async sync(id){const j=job(id),r=run(id);if(!r?.draft_id)fail(409,'NO_VERIFIED_DRAFT_TO_CHECK');await reconcile(j,r);return view(j);},
  async prepareProof(id){
   const j=job(id),r=run(id);if(!r?.paid)fail(409,'VERIFIED_TEST_PAYMENT_REQUIRED');checkDocument(j.document,{complete:true});
   const existing=db.prepare('SELECT * FROM photo_pilot_proofs WHERE job_id=? AND revision=?').get(id,j.revision);if(existing)return publicProof(existing,j);
   const bytes=await pdfs.proofPdf(j.document,assetsFor(j),{id:j.id,revision:j.revision,subtotalCents:r.record.subtotalCents});if(bytes.length>15*1024*1024)fail(413,'PROOF_PDF_TOO_LARGE');if(job(id).revision!==j.revision)fail(409,'DRAFT_CHANGED_RELOAD');
   const proof=opaque();db.prepare('INSERT OR IGNORE INTO photo_pilot_proofs(id,job_id,revision,document_hash,document,pdf,pdf_hash,status) VALUES(?,?,?,?,?,?,?,?)').run(proof,id,j.revision,hash(JSON.stringify(j.document)),JSON.stringify(j.document),bytes,hash(bytes),'prepared');event(id,'proof-prepared',{},proof);return publicProof(db.prepare('SELECT * FROM photo_pilot_proofs WHERE job_id=? AND revision=?').get(id,j.revision),j);
  },
  proof(id){const p=proofRow(id),j=job(p.job_id);return {...publicProof(p,j),jobId:j.id,document:JSON.parse(p.document),pdfUrl:base+'/photo-id-pilot/api/proofs/'+p.id+'/pdf'};},
  proofPdf(id){return Buffer.from(proofRow(id).pdf);},
  async sendProof(id,{pdfHash,reviewed}){
   {const row=proofRow(id),j=job(row.job_id),r=run(j.id);if(!r?.paid)fail(409,'VERIFIED_TEST_PAYMENT_REQUIRED');await reconcile(j,r);}
   const p=proofRow(id),j=job(p.job_id),r=run(j.id);if(!r?.paid||p.revision!==j.revision||p.document_hash!==hash(JSON.stringify(j.document)))fail(409,'PROOF_SUPERSEDED');if(reviewed!==true||pdfHash!==p.pdf_hash)fail(422,'REVIEW_PROOF_FIRST');
   if(p.status==='sent'||p.status==='approved'||p.status==='changes-requested')return this.proof(id);if(p.status!=='prepared')fail(409,'EMAIL_SEND_NEEDS_REVIEW');
   const messageId=`<photo-id-pilot-${p.id}@recognition-direct.com>`;db.prepare('UPDATE photo_pilot_proofs SET status=?,message_id=? WHERE id=? AND status=?').run('sending',messageId,id,'prepared');
   try{await send({to:PILOT_OWNER,subject:`Photo ID pilot | Proof version ${p.revision} is ready`,messageId,text:`Your private photo ID pilot proof is attached. Review every name, photo, crop, logo, color, printed side and attachment.\n\nOpen the private proof on your phone to approve or request changes:\n${base}/photo-id-pilot/#proof=${p.id}\n\nSign in with the code emailed to ${PILOT_OWNER}. This is a test only. No production or fulfillment will be triggered.`,attachments:[{filename:`PHOTO-ID-${j.id.slice(0,12)}-proof-v${p.revision}.pdf`,content:Buffer.from(p.pdf),contentType:'application/pdf'}]});db.prepare('UPDATE photo_pilot_proofs SET status=? WHERE id=?').run('sent',id);event(j.id,'proof-email-accepted',{},id);}catch{db.prepare('UPDATE photo_pilot_proofs SET status=? WHERE id=?').run('email-uncertain',id);event(j.id,'proof-email-uncertain',{},id);fail(502,'PROOF_EMAIL_NEEDS_REVIEW');}
   return this.proof(id);
  },
  async decide(id,{pdfHash,decision,note,confirmed}){
   {const row=proofRow(id),j=job(row.job_id),r=run(j.id);if(!r?.paid)fail(409,'VERIFIED_TEST_PAYMENT_REQUIRED');await reconcile(j,r);}
   const p=proofRow(id),j=job(p.job_id);if(p.revision!==j.revision||p.document_hash!==hash(JSON.stringify(j.document)))fail(409,'PROOF_SUPERSEDED');if(!run(j.id)?.paid)fail(409,'VERIFIED_TEST_PAYMENT_REQUIRED');
   if(confirmed!==true||pdfHash!==p.pdf_hash||!['approved','changes-requested'].includes(decision)||typeof note!=='string'||note.length>2000||(decision==='changes-requested'&&!note.trim()))fail(422,'PROOF_DECISION_REQUIRED');
   if(p.decision){if(p.decision===decision)return this.proof(id);fail(409,'PROOF_ALREADY_REVIEWED');}if(p.status!=='sent')fail(409,'PROOF_NOT_SENT');
   db.prepare('UPDATE photo_pilot_proofs SET status=?,decision=?,decided=? WHERE id=? AND decision IS NULL').run(decision,decision,now(),id);event(j.id,'owner-pilot-proof-'+decision,{note:note.trim(),pdfHash,reviewKind:'owner-pilot-test'},id);return this.proof(id);
  },
  async production(id){const initial=job(id),initialRun=run(id);if(!initialRun?.paid)fail(409,'LATEST_APPROVED_PROOF_REQUIRED');await reconcile(initial,initialRun);const j=job(id),r=run(id),p=db.prepare("SELECT * FROM photo_pilot_proofs WHERE job_id=? AND revision=? AND decision='approved'").get(id,j.revision);if(!r?.paid||!p||p.document_hash!==hash(JSON.stringify(j.document)))fail(409,'LATEST_APPROVED_PROOF_REQUIRED');return pdfs.cardPdf(JSON.parse(p.document),assetsFor(j),{guide:false,title:'PRIVATE PILOT - DO NOT PRODUCE - Photo ID artwork '+id});},
  eventRows(id){job(id);return db.prepare('SELECT event,at,detail,proof_id FROM photo_pilot_events WHERE job_id=? ORDER BY rowid').all(id);}
 };
}
