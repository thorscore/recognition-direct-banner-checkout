import {readFile,writeFile,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {digest} from './checkout-shipping.mjs';
import {assertCartWritable} from './checkout-state.mjs';
export function cartStorage({fileFor}){
  const queues=new Map();
  async function read(id){try{const c=JSON.parse(await readFile(fileFor(id),'utf8'));Object.defineProperty(c,'storageReadVersion',{value:c.storageVersion??0,writable:true});return c;}catch(e){if(e.code==='ENOENT')return null;throw e;}}
  async function write(c,{checkoutOwner}={}){
    const before=queues.get(c.id)??Promise.resolve();let release;const pending=new Promise(r=>release=r);queues.set(c.id,pending);await before;
    try{
      const saved=await read(c.id);
      if(saved?.checkoutAttempt&&saved.checkoutAttempt.id!==checkoutOwner)assertCartWritable(saved);
      if(saved&&(c.storageReadVersion??0)!==(saved.storageVersion??0))throw Object.assign(new Error('CART_CHANGED'),{code:'CART_CHANGED',status:409});
      const content=x=>({id:x.id,status:x.status,items:x.items});
      c.version=saved?(digest(content(c))===digest(content(saved))?saved.version??1:(saved.version??1)+1):1;
      c.storageVersion=(saved?.storageVersion??0)+1;c.updatedAt=new Date().toISOString();
      const target=fileFor(c.id),temp=target+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(c,null,2),{mode:0o600});await rename(temp,target);
      if(!Object.hasOwn(c,'storageReadVersion'))Object.defineProperty(c,'storageReadVersion',{value:c.storageVersion,writable:true});else c.storageReadVersion=c.storageVersion;
    }finally{release();if(queues.get(c.id)===pending)queues.delete(c.id);}
  }
  return {read,write};
}
