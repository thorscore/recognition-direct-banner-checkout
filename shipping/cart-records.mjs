export async function syncCartRecords(cart,result,{readRecord,writeRecord}){
  const quote=cart.checkoutAttempt?.quote;
  for(const item of cart.items){
    let record;try{record=await readRecord(item.orderId);}catch(e){if(e.code==='ENOENT')continue;throw e;}
    record.shopifyDraftOrderId=result.id;record.checkoutUrl=result.invoiceUrl;record.cartStatus='checked_out';
    record.email=quote.contact.email;record.contact={name:quote.contact.name,company:quote.contact.company,phone:quote.contact.phone};
    record.acceptedShipping={quoteId:quote.id,policy:quote.policy,cents:quote.result.shippingCents,origin:'8680 Troy St., Spring Valley, CA 91977',destination:quote.destination};
    await writeRecord(record);
  }
}
