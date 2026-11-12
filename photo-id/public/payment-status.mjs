const running=new WeakSet();
export function paymentFeedback(element,text,isError=false){element.hidden=false;element.textContent=text;element.classList.toggle('error',isError);element.scrollIntoView?.({block:'nearest',behavior:'smooth'});}
export async function checkPaymentStatus({button,feedback,prepare,check,formatError,onError}){
 if(running.has(button))return null;running.add(button);const label=button.textContent;
 button.disabled=true;button.textContent='Checking Shopify…';button.setAttribute('aria-busy','true');
 paymentFeedback(feedback,'Checking your existing order with Shopify. Please wait…');
 try{
  const result=await check();const paid=result?.checkout?.paid===true;
  paymentFeedback(feedback,paid?`Payment verified${result.checkout.orderName?' · '+result.checkout.orderName:''}. Next: Prepare PDF proof.`:'Shopify has not confirmed a completed payment for this order yet. If you just finished checkout, wait a moment and check again.');
  if(paid)prepare.focus?.({preventScroll:true});return result;
 }catch(error){paymentFeedback(feedback,formatError(error),true);onError?.(error);return null;}
 finally{running.delete(button);button.textContent=label;button.disabled=false;button.setAttribute('aria-busy','false');}
}
