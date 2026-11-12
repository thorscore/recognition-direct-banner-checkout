import {paymentFeedback} from './payment-status.mjs';
const running=new WeakSet();

export function showProofOutcome({proof,feedback,production,confirmation}){
 const approved=!proof.superseded&&proof.decision==='approved';
 production.hidden=!approved;
 if(confirmation){
  confirmation.screen.hidden=!approved;
  confirmation.review.hidden=approved;
  confirmation.toolbar.hidden=approved;
 }
 if(approved){
  production.href='/photo-id/api/jobs/'+proof.jobId+'/production.pdf';
  if(confirmation){
   feedback.hidden=true;feedback.textContent='';
   confirmation.details.textContent='Your approval of proof version '+proof.revision+' has been received and saved.';
   confirmation.order.href='#job='+proof.jobId;
   confirmation.proof.href=proof.pdfUrl;
   confirmation.screen.scrollIntoView?.({block:'start',behavior:'smooth'});
   confirmation.title.focus?.({preventScroll:true});
  }else paymentFeedback(feedback,'Your approval is saved. Return to your badge order to see its status.');
 }else if(proof.decision==='changes-requested'&&!proof.superseded){
  paymentFeedback(feedback,'Your change request is saved. Return to the badge order to edit the design and prepare a new proof.');
 }else{feedback.hidden=true;feedback.textContent='';}
}

export async function submitProofDecision({decision,checkbox,notes,approve,requestChanges,feedback,send,render,formatError,onError}){
 if(running.has(feedback))return null;
 if(!checkbox.checked){paymentFeedback(feedback,'First open the PDF and check “I reviewed this exact PDF and its badge details,” then approve or request changes.',true);checkbox.focus?.({preventScroll:true});return null;}
 if(decision==='changes-requested'&&!notes.value.trim()){paymentFeedback(feedback,'Describe the changes you need in “Changes or notes,” then choose Request changes.',true);notes.focus?.({preventScroll:true});return null;}
 running.add(feedback);
 const button=decision==='approved'?approve:requestChanges,label=button.textContent;
 const previous=[approve.disabled,requestChanges.disabled];let saved=false;
 approve.disabled=true;requestChanges.disabled=true;button.setAttribute('aria-busy','true');
 button.textContent=decision==='approved'?'Saving approval…':'Saving change request…';
 paymentFeedback(feedback,decision==='approved'?'Saving your approval and checking the linked Shopify test order. Please wait…':'Saving your change request. Please wait…');
 try{
  const result=await send();
  if(result?.decision!==decision)throw Error('PROOF_DECISION_UNCONFIRMED');
  await render(result);saved=true;return result;
 }catch(error){paymentFeedback(feedback,formatError(error),true);onError?.(error);return null;}
 finally{running.delete(feedback);button.textContent=label;button.setAttribute('aria-busy','false');if(!saved){approve.disabled=previous[0];requestChanges.disabled=previous[1];}}
}
