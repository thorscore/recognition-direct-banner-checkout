export function shippingReleaseConfig(env,{preview=env.SHIPPING_INTEGRATION_PREVIEW==='true'}={}){
 if(env.SHOPIFY_SHIPPING_ESTIMATES!=='true')return {enabled:false,markupBasisPoints:0,handlingCents:0};
 if(typeof env.SHIPPING_QUOTE_SIGNING_KEY!=='string'||env.SHIPPING_QUOTE_SIGNING_KEY.length<32)throw Error('SHIPPING_SIGNING_KEY_REQUIRED');
 const file=Boolean(env.SHIPPING_RATE_SNAPSHOT_FILE),gzip=Boolean(env.SHIPPING_RATE_SNAPSHOT_GZIP);
 if(file&&gzip)throw Error('ONE_PRIVATE_SHIPPING_RATE_SOURCE_REQUIRED');
 if(!preview&&!file&&!gzip)throw Error('PRIVATE_SHIPPING_RATE_SNAPSHOT_REQUIRED');
 return {enabled:true,preview,rateSource:file?'private-file':gzip?'private-environment':'local-test-fixtures',markupBasisPoints:0,handlingCents:0};
}
