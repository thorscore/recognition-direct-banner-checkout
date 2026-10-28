import { stat } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { ExpressOneStore } from './express-one-store.mjs';

const {values,positionals} = parseArgs({allowPositionals:true,options:{database:{type:'string'},reference:{type:'string'},company:{type:'string'}}});
if (!values.database) throw new Error('Specify the existing portal database with --database.');
if (!(await stat(values.database)).isFile()) throw new Error('Portal database was not found.');
const store = new ExpressOneStore(values.database);
try {
  if (positionals[0] === 'identities') {
    console.log(JSON.stringify(store.db.prepare('SELECT reference,issuer,subject,seen_at FROM identities ORDER BY seen_at DESC').all(),null,2));
  } else if (positionals[0] === 'add-account') {
    const identity = store.db.prepare('SELECT issuer,subject FROM identities WHERE reference=?').get(values.reference || '');
    if (!identity) throw new Error('Use a reference from a completed, verified Shopify sign-in.');
    if (!values.company?.trim()) throw new Error('Specify the verified customer company with --company.');
    const account = store.createAccount({role:'staff',subject:'local-operator'},{...identity,company:values.company});
    console.log(JSON.stringify({id:account.id,company:account.company}));
  } else throw new Error('Use identities or add-account. This local tool does not create paid stock or send invitations.');
} finally { store.close(); }
