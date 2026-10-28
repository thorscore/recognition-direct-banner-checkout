import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { parse } from 'csv-parse/sync';

export class PortalError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const fail = (message, status) => { throw new PortalError(message, status); };
const text = (value, max = 500) => {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail('Enter valid text.');
  return value.trim();
};
const required = (value, max) => { const result = text(value, max); if (!result) fail('Complete the required fields.'); return result; };
const integer = (value, min, max) => { if (!Number.isSafeInteger(value) || value < min || value > max) fail('Enter a valid whole number.'); return value; };
const staff = actor => { if (actor?.role !== 'staff') fail('Staff access required.', 403); };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export const propertyFields = [
  ['propertyName','Property name',160],['attention','Attention / contact',160],
  ['address','Street address',240],['leasingOffice','Leasing office / number',120],
  ['city','City',100],['state','State',40],['zip','ZIP code',20],
  ['email','Email',254],['phone','Phone',60]
];

export function orderProfile(input) {
  if (input?.kind !== 'property-domed') fail('Unsupported order profile.');
  const supportEmail = required(input.supportEmail,254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) fail('Enter a valid support email.');
  return {kind:'property-domed',title:required(input.title,180),description:required(input.description,1000),
    finishes:['Gold','Silver'],firstNameOnly:true,fields:propertyFields.map(([name,label,max]) => ({name,label,max})),
    supportEmail,supportPhone:required(input.supportPhone,60),sourceName:required(input.sourceName,240)};
}

function propertyDetails(input,profile) {
  if (!profile) return {};
  const result = {};
  for (const [key,label,max] of propertyFields) {
    try { result[key] = required(input?.[key],max); }
    catch { fail(`Complete ${label.toLowerCase()}.`); }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) fail('Enter a valid property email address.');
  return result;
}

export function badgeNames(input,profile) {
  let names = input.names;
  if (input.namesFile) {
    if (names?.length) fail('Use either the names field or a names file.');
    const file = required(input.namesFile, 65536);
    if (input.fileType === 'csv') {
      let rows;
      try { rows = parse(file, { bom: true, skip_empty_lines: true, trim: true, max_record_size: 2048 }); }
      catch { fail('The CSV file could not be read.'); }
      const headers = (rows.shift() || []).map(value => value.toLowerCase());
      const nameColumn = headers.indexOf('name');
      if (nameColumn < 0) fail('CSV files need a Name column.');
      const titleColumn = headers.indexOf('title');
      const finishColumn = headers.indexOf('finish');
      if (profile && finishColumn < 0) fail('CSV files for this badge need Name and Finish columns.');
      if (profile && headers.includes('quantity')) fail('Use one CSV row per badge, without a Quantity column.');
      names = rows.map(row => ({ name: row[nameColumn], title: titleColumn < 0 ? '' : row[titleColumn], ...(profile ? {finish:row[finishColumn]}:{}) }));
    } else if (input.fileType === 'txt') {
      if (profile) fail('Use the gold/silver quantities or a CSV with Name and Finish columns.');
      names = file.split(/\r?\n/).filter(line => line.trim()).map(name => ({ name, title: '' }));
    } else fail('Use a TXT or CSV names file.');
  }
  if (!Array.isArray(names) || names.length < 1 || names.length > 500) fail('Provide between 1 and 500 badge names.');
  return names.map(entry => {
    const result = { name: required(entry?.name,profile ? 80:180), title: text(entry?.title || '', 180) };
    if (profile) {
      if (result.title) fail('This badge format uses first names only, without titles.');
      const finish = profile.finishes.find(value => value.toLowerCase() === String(entry?.finish || '').toLowerCase());
      if (!finish) fail('Choose Gold or Silver for every badge.');
      result.finish = finish;
    }
    return result;
  });
}

export class ExpressOneStore {
  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY, company TEXT NOT NULL, issuer TEXT NOT NULL, subject TEXT NOT NULL, UNIQUE(issuer,subject));
      CREATE TABLE IF NOT EXISTS stock(id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), title TEXT NOT NULL, original INTEGER NOT NULL CHECK(original>0), remaining INTEGER NOT NULL CHECK(remaining>=0 AND remaining<=original), paid_order TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), stock_id TEXT NOT NULL REFERENCES stock(id), quantity INTEGER NOT NULL CHECK(quantity>0), names TEXT NOT NULL, delivery TEXT NOT NULL, notes TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('requested','approved','shipped','ready','rejected','cancelled')), reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, request_key TEXT NOT NULL, payload_hash TEXT NOT NULL, UNIQUE(account_id,request_key));
      CREATE TABLE IF NOT EXISTS invoices(id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), reference TEXT NOT NULL UNIQUE, amount_cents INTEGER NOT NULL CHECK(amount_cents>0), created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS shipping(id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE REFERENCES requests(id), stock_id TEXT NOT NULL REFERENCES stock(id), account_id TEXT NOT NULL REFERENCES accounts(id), cents INTEGER NOT NULL CHECK(cents>=0), tracking TEXT NOT NULL, invoice_id TEXT REFERENCES invoices(id), created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, details TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS identities(reference TEXT PRIMARY KEY, issuer TEXT NOT NULL, subject TEXT NOT NULL, seen_at TEXT NOT NULL, UNIQUE(issuer,subject));
      CREATE TABLE IF NOT EXISTS order_profiles(account_id TEXT PRIMARY KEY REFERENCES accounts(id), payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS profile_images(account_id TEXT NOT NULL REFERENCES accounts(id), image_key TEXT NOT NULL, body BLOB NOT NULL, PRIMARY KEY(account_id,image_key));
      CREATE INDEX IF NOT EXISTS request_owner ON requests(account_id,created_at);
      CREATE INDEX IF NOT EXISTS stock_requests ON requests(stock_id,status);
      CREATE UNIQUE INDEX IF NOT EXISTS paid_stock_source ON stock(account_id,paid_order,title);
    `);
    if (!this.db.prepare('PRAGMA table_info(requests)').all().some(column => column.name === 'details')) this.db.exec("ALTER TABLE requests ADD COLUMN details TEXT NOT NULL DEFAULT '{}'");
  }
  close() { this.db.close(); }
  transaction(run) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = run(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  event(actor, action, target, details = {}) {
    this.db.prepare('INSERT INTO events VALUES(?,?,?,?,?,?)').run(randomUUID(), actor.subject, action, target, JSON.stringify(details), new Date().toISOString());
  }
  accountForIdentity(identity) {
    return this.db.prepare('SELECT id,company FROM accounts WHERE issuer=? AND subject=?').get(identity.issuer, identity.subject);
  }
  profileForAccount(accountId) {
    const row = this.db.prepare('SELECT payload FROM order_profiles WHERE account_id=?').get(accountId);
    return row ? {...JSON.parse(row.payload),images:this.db.prepare('SELECT image_key AS key FROM profile_images WHERE account_id=? ORDER BY image_key').all(accountId).map(image => ({...image,url:`/express-one/api/badge-image/${accountId}/${image.key}`}))}:null;
  }
  setProfileImage(actor,accountId,key,body) {
    staff(actor);
    if (!this.profileForAccount(accountId)) fail('Order profile not found.',404);
    if (!['gold','silver','logo'].includes(key) || !Buffer.isBuffer(body) || body.length>500000 || body.subarray(0,8).toString('hex')!=='89504e470d0a1a0a') fail('Use a supported PNG badge image.');
    this.transaction(() => {
      this.db.prepare('INSERT INTO profile_images VALUES(?,?,?) ON CONFLICT(account_id,image_key) DO UPDATE SET body=excluded.body').run(accountId,key,body);
      this.event(actor,'profile-image-updated',accountId,{key});
    });
  }
  profileImage(actor,accountId,key) {
    if (actor?.role !== 'staff' && (actor?.role !== 'customer' || actor.accountId !== accountId)) fail('Image not found.',404);
    const row = this.db.prepare('SELECT body FROM profile_images WHERE account_id=? AND image_key=?').get(accountId,key);
    if (!row) fail('Image not found.',404);
    return Buffer.from(row.body);
  }
  setOrderProfile(actor,accountId,input) {
    staff(actor);
    if (!this.db.prepare('SELECT id FROM accounts WHERE id=?').get(accountId)) fail('Account not found.',404);
    const profile = orderProfile(input);
    return this.transaction(() => {
      this.db.prepare('INSERT INTO order_profiles VALUES(?,?) ON CONFLICT(account_id) DO UPDATE SET payload=excluded.payload').run(accountId,JSON.stringify(profile));
      this.event(actor,'order-profile-updated',accountId,{source:profile.sourceName});
      return profile;
    });
  }
  rememberIdentity(identity) {
    const reference = createHash('sha256').update(`${identity.issuer}|${identity.subject}`).digest('hex').slice(0,20);
    this.db.prepare('INSERT INTO identities VALUES(?,?,?,?) ON CONFLICT(reference) DO UPDATE SET seen_at=excluded.seen_at').run(reference,identity.issuer,identity.subject,new Date().toISOString());
    return reference;
  }
  createAccount(actor, input) {
    staff(actor);
    const id = randomUUID();
    const company = required(input.company, 160), issuer = required(input.issuer, 500), subject = required(input.subject, 500);
    if (!/^https:\/\//.test(issuer) && issuer !== 'preview') fail('Use the verified sign-in issuer.');
    return this.transaction(() => {
      this.db.prepare('INSERT INTO accounts VALUES(?,?,?,?)').run(id, company, issuer, subject);
      this.event(actor, 'account-created', id);
      return { id, company };
    });
  }
  addStock(actor, input) {
    staff(actor);
    const accountId = required(input.accountId, 80), title = required(input.title, 180), paidOrder = required(input.paidOrder, 120);
    const quantity = integer(input.quantity, 1, 100000);
    if (input.paymentVerified !== true) fail('Verify the paid order before adding stock.');
    if (!this.db.prepare('SELECT id FROM accounts WHERE id=?').get(accountId)) fail('Account not found.', 404);
    return this.transaction(() => {
      if (this.db.prepare('SELECT id FROM stock WHERE account_id=? AND paid_order=? AND title=?').get(accountId,paidOrder,title)) fail('This paid-order badge style has already been added.',409);
      const id = randomUUID();
      this.db.prepare('INSERT INTO stock VALUES(?,?,?,?,?,?,?)').run(id, accountId, title, quantity, quantity, paidOrder, new Date().toISOString());
      this.event(actor, 'prepaid-stock-added', id, { quantity, paidOrder });
      return { id };
    });
  }
  stockRow(id, accountId) {
    return this.db.prepare(`SELECT s.*, COALESCE((SELECT SUM(quantity) FROM requests WHERE stock_id=s.id AND status IN ('requested','approved')),0) AS reserved FROM stock s WHERE s.id=? AND s.account_id=?`).get(id, accountId);
  }
  createRequest(actor, input) {
    if (actor?.role !== 'customer' || !actor.accountId) fail('Customer access required.', 403);
    const stockId = required(input.stockId, 80), key = required(input.requestKey, 100);
    const profile = this.profileForAccount(actor.accountId);
    const names = badgeNames(input,profile), notes = text(input.notes || '', 1500);
    const details = propertyDetails(input.details,profile);
    const delivery = input.delivery;
    if (!['ship','pickup-la-mesa','pickup-pine-valley'].includes(delivery)) fail('Choose shipping or a pickup location.');
    const payloadHash = hash({ stockId, names, notes, delivery,...(profile ? {details}:{}) });
    return this.transaction(() => {
      const prior = this.db.prepare('SELECT id,payload_hash FROM requests WHERE account_id=? AND request_key=?').get(actor.accountId, key);
      if (prior) {
        if (prior.payload_hash !== payloadHash) fail('This request key was already used for different details.', 409);
        return { id: prior.id, duplicate: true };
      }
      const stock = this.stockRow(stockId, actor.accountId);
      if (!stock) fail('Badge stock not found.', 404);
      if (names.length > stock.remaining - stock.reserved) fail('Not enough available badges. Refresh inventory before requesting.', 409);
      const id = randomUUID(), at = new Date().toISOString();
      this.db.prepare('INSERT INTO requests(id,account_id,stock_id,quantity,names,delivery,notes,status,created_at,updated_at,request_key,payload_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id, actor.accountId, stockId, names.length, JSON.stringify(names), delivery, notes, 'requested', at, at, key, payloadHash);
      this.db.prepare('UPDATE requests SET details=? WHERE id=?').run(JSON.stringify(details),id);
      this.event(actor, 'release-requested', id, { quantity: names.length });
      return { id, duplicate: false };
    });
  }
  changeRequest(actor, input) {
    if (!['staff','customer'].includes(actor?.role)) fail('Sign in to continue.',401);
    const id = required(input.id, 80), action = input.action;
    return this.transaction(() => {
      const row = this.db.prepare('SELECT * FROM requests WHERE id=?').get(id);
      if (!row || actor?.role !== 'staff' && row.account_id !== actor?.accountId) fail('Request not found.', 404);
      const allowed = actor.role === 'staff' ? ['approve','reject','fulfill'] : ['cancel'];
      if (!allowed.includes(action)) fail('This action is not allowed.', 403);
      if (action === 'cancel' && row.status !== 'requested' || action === 'approve' && row.status !== 'requested' || action === 'reject' && !['requested','approved'].includes(row.status) || action === 'fulfill' && row.status !== 'approved') fail('The request has already changed. Refresh before continuing.', 409);
      const at = new Date().toISOString();
      let status = { approve:'approved',reject:'rejected',cancel:'cancelled',fulfill:row.delivery === 'ship' ? 'shipped':'ready' }[action];
      const reason = action === 'reject' ? required(input.reason, 300) : '';
      if (action === 'fulfill') {
        const cents = integer(input.shippingCents, 0, 1000000);
        if (row.delivery !== 'ship' && cents !== 0) fail('Pickup releases cannot have shipping charges.');
        const stock = this.db.prepare('UPDATE stock SET remaining=remaining-? WHERE id=? AND remaining>=?').run(row.quantity, row.stock_id, row.quantity);
        if (stock.changes !== 1) fail('Inventory changed; review this request.', 409);
        this.db.prepare('INSERT INTO shipping VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(), row.id, row.stock_id, row.account_id, cents, text(input.tracking || '', 200), null, at);
      }
      this.db.prepare('UPDATE requests SET status=?,reason=?,updated_at=? WHERE id=?').run(status, reason, at, id);
      this.event(actor, `release-${status}`, id);
      return { id, status };
    });
  }
  recordInvoice(actor, input) {
    staff(actor);
    const accountId = required(input.accountId, 80), reference = required(input.reference, 120);
    return this.transaction(() => {
      const charges = this.db.prepare('SELECT c.id,c.cents FROM shipping c JOIN stock s ON s.id=c.stock_id WHERE c.account_id=? AND c.invoice_id IS NULL AND s.remaining=0').all(accountId);
      const amount = charges.reduce((sum, row) => sum + row.cents, 0);
      if (!amount) fail('There are no uninvoiced shipping charges on depleted stock.', 409);
      const id = randomUUID();
      this.db.prepare('INSERT INTO invoices VALUES(?,?,?,?,?)').run(id, accountId, reference, amount, new Date().toISOString());
      for (const charge of charges) this.db.prepare('UPDATE shipping SET invoice_id=? WHERE id=?').run(id, charge.id);
      this.event(actor, 'shipping-invoice-recorded', id, { amountCents: amount, reference });
      return { id, amountCents: amount };
    });
  }
  snapshot(actor) {
    if (!['staff','customer'].includes(actor?.role)) fail('Sign in to continue.', 401);
    const scope = actor.role === 'staff' ? '' : ' WHERE account_id=?';
    const params = actor.role === 'staff' ? [] : [required(actor.accountId, 80)];
    const stock = this.db.prepare(`SELECT s.*,a.company,COALESCE((SELECT SUM(quantity) FROM requests r WHERE r.stock_id=s.id AND r.status IN ('requested','approved')),0) AS reserved FROM stock s JOIN accounts a ON a.id=s.account_id${scope.replace('account_id','s.account_id')} ORDER BY s.created_at DESC`).all(...params);
    const requests = this.db.prepare(`SELECT r.*,s.title,a.company FROM requests r JOIN stock s ON s.id=r.stock_id JOIN accounts a ON a.id=r.account_id${scope.replace('account_id','r.account_id')} ORDER BY r.created_at DESC LIMIT 500`).all(...params).map(({request_key,payload_hash,...row}) => ({...row,names:JSON.parse(row.names),details:JSON.parse(row.details)}));
    const shipping = this.db.prepare(`SELECT c.*,s.remaining,a.company FROM shipping c JOIN stock s ON s.id=c.stock_id JOIN accounts a ON a.id=c.account_id${scope.replace('account_id','c.account_id')} ORDER BY c.created_at DESC LIMIT 500`).all(...params);
    const invoices = this.db.prepare(`SELECT * FROM invoices${scope} ORDER BY created_at DESC`).all(...params);
    const accounts = actor.role === 'staff' ? this.db.prepare('SELECT id,company FROM accounts ORDER BY company').all() : [this.db.prepare('SELECT id,company FROM accounts WHERE id=?').get(actor.accountId)].filter(Boolean);
    const totals = this.db.prepare(`SELECT COALESCE(SUM(CASE WHEN invoice_id IS NULL THEN cents ELSE 0 END),0) AS uninvoicedShippingCents FROM shipping${scope}`).get(...params);
    const invoiceReady = this.db.prepare(`SELECT a.id AS accountId,a.company,SUM(c.cents) AS cents FROM shipping c JOIN stock s ON s.id=c.stock_id JOIN accounts a ON a.id=c.account_id WHERE c.invoice_id IS NULL AND s.remaining=0${actor.role === 'staff' ? '':' AND c.account_id=?'} GROUP BY a.id HAVING SUM(c.cents)>0`).all(...params);
    return { accounts:accounts.map(account => ({...account,orderProfile:this.profileForAccount(account.id)})), stock:stock.map(row => ({...row,available:row.remaining-row.reserved})), requests, shipping, invoices, totals, invoiceReady };
  }
}

export function seedPreview(store) {
  const staff = { role:'staff',subject:'preview-staff' };
  for (const [subject,company,quantity,title] of [['preview-customer','Sample Medical Group',40,'White 1 x 3 / magnetic / standard'],['preview-other','Sample Hospitality',8,'White 1 x 3 / pin / standard']]) {
    if (!store.accountForIdentity({issuer:'preview',subject})) {
      const account = store.createAccount(staff,{company,issuer:'preview',subject});
      store.addStock(staff,{accountId:account.id,title,quantity,paidOrder:'SAMPLE-PAID-ORDER',paymentVerified:true});
    }
  }
}
