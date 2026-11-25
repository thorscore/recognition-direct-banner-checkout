import {PRODUCT} from './archive.mjs';
export const LAUNCH_VERSION='20oz-v1';
export const LAUNCH_NOTE='RD 20 OZ NATIVE CHECKOUT V1 — PROOF REQUIRED.';
const fail=code=>{throw Object.assign(Error(code),{status:409,code});};
export const emailAddress=value=>typeof value==='string'&&value.length<=254&&/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value)?value.trim().toLowerCase():null;
export function launchControl({db,env,variants}){
 db.exec('CREATE TABLE IF NOT EXISTS tumbler_launch_control(id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL,updated_at INTEGER NOT NULL)');
 db.prepare('INSERT OR IGNORE INTO tumbler_launch_control VALUES(1,0,0)').run();
 const status=()=>({version:LAUNCH_VERSION,productId:PRODUCT,maxUnits:4,enabled:env.TUMBLER_20OZ_LAUNCH_ENABLED==='true'&&db.prepare('SELECT enabled FROM tumbler_launch_control WHERE id=1').get().enabled===1,serverApproved:env.TUMBLER_20OZ_LAUNCH_ENABLED==='true',markupCents:0,handlingCents:0});
 return {status,set(enabled){if(typeof enabled!=='boolean')fail('LAUNCH_SETTING_INVALID');if(enabled&&env.TUMBLER_20OZ_LAUNCH_ENABLED!=='true')fail('LAUNCH_AWAITING_APPROVAL');db.prepare('UPDATE tumbler_launch_control SET enabled=?,updated_at=? WHERE id=1').run(enabled?1:0,Date.now());return status();},admit({sku,quantity,email}){if(!status().enabled)fail('TUMBLER_LAUNCH_PAUSED');const variant=variants.find(v=>v.sku===sku);if(!variant||!Number.isSafeInteger(quantity)||quantity<1||quantity>4||!emailAddress(email))fail('TUMBLER_LAUNCH_SCOPE_INVALID');return {version:LAUNCH_VERSION,productId:PRODUCT,variantId:variant.variantId,sku,quantity,customerEmail:emailAddress(email),admittedAt:new Date().toISOString()};}};
}
export function queueSummary(jobs){
 const counts={awaitingProof:0,awaitingApproval:0,changesRequested:0,approved:0,held:0};
 for(const j of jobs){if(j.state==='awaiting_staff_proof'||j.state==='proof_prepared')counts.awaitingProof++;else if(j.state==='awaiting_customer_approval')counts.awaitingApproval++;else if(j.state==='changes_requested')counts.changesRequested++;else if(j.proof?.status==='approved')counts.approved++;else counts.held++;}return counts;
}
