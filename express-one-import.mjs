import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

const key = value => createHash('sha256').update(value).digest('hex').slice(0,24);
const tidy = value => typeof value === 'string' ? value.trim().replace(/\s+/g,' ') : '';
const count = value => typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
const source = (book,sheet,cell) => ({file:book.file,sheet:sheet.name,cell,sha256:book.sha256});
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) ? value.slice(0,10) : null;

export function buildImportPlan(extracted, {asOf = '2026-10-28', companyMappings = {}, distinctStyleCompanies = []} = {}) {
  if (!Array.isArray(extracted?.books) || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error('Provide extracted workbooks and an explicit review date.');
  const distinctStyles = new Set(distinctStyleCompanies);
  const accounts = new Map(), files = [];
  for (const book of extracted.books) {
    if (!/^[a-f0-9]{64}$/.test(book.sha256) || !Array.isArray(book.sheets)) throw new Error('Source fingerprint missing.');
    const sheet = book.sheets.find(sheet => sheet.cells?.some(cell => cell.cell === 'F1' && tidy(cell.value).toLowerCase() === 'balance'));
    const contactSheet = sheet || book.sheets.find(sheet => sheet.cells?.some(cell => cell.cell === 'A2' && tidy(cell.value).toLowerCase() === 'company'));
    const cells = new Map((contactSheet?.cells || []).map(cell => [cell.cell,cell]));
    const get = address => cells.get(address)?.value;
    const isTemplate = /^xxxExpress One Blank/i.test(book.file);
    let classification = sheet && !isTemplate ? 'ledger' : isTemplate ? 'template' : 'reference';
    let company = tidy(get('B2'));
    if (!company || ['Purchase','Company'].includes(company)) company = book.file.replace(/\.xlsx$/i,'');
    if (companyMappings[book.file]) company = tidy(companyMappings[book.file]);
    const id = key(company.toLowerCase());
    const fileId = key(book.file.toLowerCase());
    const issue = (code,message,refs = []) => ({code,message,refs});
    const issues = [];
    const account = accounts.get(id) || {id,company,status:'staged',identityVerified:false,inventoryApproved:false,contact:{},styles:[],references:[],issues:[]};
    if (classification === 'template') {
      files.push({id:fileId,file:book.file,sha256:book.sha256,classification,accountId:null,sheets:book.sheets.map(sheet => ({name:sheet.name,rows:sheet.rows})),issues:[issue('template','Template file excluded, even when it contains example customer data.')]});
      continue;
    }
    for (const [field,address] of Object.entries({name:'B3',email:'B7',phone:'B6',address:'B4',cityStateZip:'B5'})) {
      const value = tidy(get(address));
      if (value && !account.contact[field]) account.contact[field] = {value,source:source(book,contactSheet,address)};
      else if (value && account.contact[field]?.value !== value) account.issues.push(issue('contact-conflict',`Source files disagree on ${field}.`,[source(book,contactSheet,address),account.contact[field].source]));
    }
    if (classification === 'ledger') {
      const rowNumbers = [...new Set(sheet.cells.filter(cell => cell.col >= 3 && cell.col <= 9 && cell.row >= 2).map(cell => cell.row))].sort((a,b) => a-b);
      const history = rowNumbers.map(row => ({row,date:date(get(`C${row}`)),dateRaw:get(`C${row}`) ?? null,purchased:count(get(`D${row}`)),released:count(get(`E${row}`)),balance:count(get(`F${row}`)),delivery:get(`G${row}`) ?? null,recordedCharge:typeof get(`H${row}`) === 'number' ? get(`H${row}`) : null,annotation:get(`I${row}`) ?? null,source:source(book,sheet,`C${row}:I${row}`)})).filter(row => row.purchased !== null || row.released !== null || row.balance !== null);
      const balances = history.filter(row => row.balance !== null);
      const final = balances.at(-1);
      if (!final) issues.push(issue('missing-balance','No numeric final balance could be read.'));
      if (final?.balance < 0) issues.push(issue('negative-balance','Final source balance is negative; do not create available stock.',[source(book,sheet,`F${final.row}`)]));
      const future = history.filter(row => row.date > asOf);
      if (future.length) issues.push(issue('future-dates',`${future.length} ledger rows are dated after ${asOf}. Dates were not corrected or filtered.`,future.slice(0,5).map(row => source(book,sheet,`C${row.row}`))));
      const outOfOrder = history.filter((row,index) => row.date && index && history[index-1].date && row.date < history[index-1].date);
      if (outOfOrder.length) issues.push(issue('date-order',`${outOfOrder.length} ledger dates go backwards. Row order and source dates are preserved.`,outOfOrder.slice(0,5).map(row => source(book,sheet,`C${row.row}`))));
      let previous;
      const mismatches = [];
      for (const row of history) {
        if (previous !== undefined && row.balance !== null && (row.purchased !== null || row.released !== null) && row.balance !== previous+(row.purchased || 0)-(row.released || 0)) mismatches.push(row);
        if (row.balance !== null) previous = row.balance;
      }
      if (mismatches.length) issues.push(issue('balance-rollforward',`${mismatches.length} balance rows differ from prior balance plus purchases minus releases.`,mismatches.slice(0,8).map(row => source(book,sheet,`D${row.row}:F${row.row}`))));
      const invalid = sheet.cells.filter(cell => cell.col >= 3 && cell.col <= 6 && (cell.error || cell.formula && cell.value === null));
      if (invalid.length) issues.push(issue('ledger-formula-error',`${invalid.length} ledger cells have an error or no cached formula result.`,invalid.slice(0,5).map(cell => source(book,sheet,cell.cell))));
      if (/closing|final/i.test(book.file)) issues.push(issue('status-review','Filename indicates a closing/final ledger. Confirm whether this account is still active.'));
      if (/photo id|membership cards|seating plates|locker plates|awards/i.test(book.file)) issues.push(issue('special-product','This ledger is for a special product. Confirm its required order fields before enabling the standard badge request form.'));
      if (sheet.cells.some(cell => cell.col === 3 && typeof cell.value === 'string' && /^(pin|magnet|magnetic|mag|domed)\b/i.test(cell.value.trim()) && !date(cell.value))) issues.push(issue('multiple-sections','Separate badge sections appear in this worksheet. Do not use only the last section as the entire account balance.'));
      if (history.some(row => row.purchased !== null && row.purchased < 0 || row.released !== null && row.released < 0)) issues.push(issue('quantity-adjustment','Negative movements appear in the ledger. Confirm how adjustments should migrate.'));
      const description = tidy(get('B12'));
      if (!description) issues.push(issue('missing-style','Badge style is not stated in the source description.'));
      account.styles.push({id:fileId,file:book.file,sheet:sheet.name,description,unitPrice:get('B13') ?? null,sourceComments:[get('B8'),get('B14')].filter(value => value !== undefined && value !== null),finalBalance:final?.balance ?? null,finalBalanceSource:final ? source(book,sheet,`F${final.row}`) : null,lastRecordedDate:history.filter(row => row.date).at(-1)?.date || null,history,issues,approved:false});
    } else {
      const formulaErrors = book.sheets.reduce((sum,sheet) => sum+sheet.cells.filter(cell => cell.error).length,0);
      issues.push(issue('reference-only','No stock ledger detected. Preserve as a reference; do not convert quantities to inventory.'));
      if (formulaErrors) issues.push(issue('reference-formula-errors',`${formulaErrors} source cells contain formula errors.`));
      account.references.push({id:fileId,file:book.file,sheets:book.sheets.map(sheet => ({name:sheet.name,rows:sheet.rows})),issues});
    }
    files.push({id:fileId,file:book.file,sha256:book.sha256,classification,accountId:id,sheets:book.sheets.map(sheet => ({name:sheet.name,rows:sheet.rows})),issues});
    accounts.set(id,account);
  }
  for (const account of accounts.values()) {
    const overlapping = account.styles.length > 1 && !distinctStyles.has(account.company);
    if (account.styles.length > 1) account.issues.push({code:overlapping?'multiple-ledgers':'multiple-styles',message:overlapping?'Multiple ledgers may overlap. Confirm which current file to use before enabling stock.':'Distinct product/style files are kept separate. Their stock balances are not combined.',refs:[]});
    if (!account.contact.email) account.issues.push({code:'missing-email',message:'No contact email in the ledger header. Confirm who may access this account.',refs:[]});
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.contact.email.value)) account.issues.push({code:'invalid-email',message:'The source email field is not a single valid email address. Confirm the authorized contact.',refs:[account.contact.email.source]});
    for (const style of account.styles) {
      const blockers = ['negative-balance','missing-balance','balance-rollforward','ledger-formula-error','multiple-sections','status-review','special-product'];
      style.openingQuantity = style.finalBalance !== null && style.finalBalance >= 0 ? style.finalBalance : null;
      style.importStatus = style.issues.some(issue => blockers.includes(issue.code)) || overlapping ? 'hold' : 'prepared';
      if (style.importStatus === 'hold') style.openingQuantity = null;
    }
    account.issues.push({code:'activation-required',message:'Confirm current physical stock, prepaid status and authorized sign-in identity before activation.',refs:[]});
  }
  const result = {version:1,asOf,sourceFolder:extracted.source,inventoryRule:'Use final source balances as draft opening quantities; hold exceptions and require verified sign-in before activation.',accounts:[...accounts.values()].sort((a,b) => a.company.localeCompare(b.company)),files};
  result.summary = {workbooks:files.length,accounts:result.accounts.length,ledgers:files.filter(file => file.classification === 'ledger').length,references:files.filter(file => file.classification === 'reference').length,templates:files.filter(file => file.classification === 'template').length,negativeBalances:result.accounts.flatMap(account => account.styles).filter(style => style.finalBalance < 0).length,sourceIssueAccounts:result.accounts.filter(account => account.issues.some(issue => !['activation-required','missing-email'].includes(issue.code)) || account.styles.some(style => style.issues.length)).length,activeAccounts:0};
  return result;
}

export function stageImport(plan,path) {
  if (plan.version !== 1 || !Array.isArray(plan.accounts)) throw new Error('Unsupported import plan.');
  const db = new DatabaseSync(path);
  try {
    db.exec(`PRAGMA foreign_keys=ON; BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS import_batches(id TEXT PRIMARY KEY,as_of TEXT NOT NULL,summary TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS import_state(singleton INTEGER PRIMARY KEY CHECK(singleton=1),batch_id TEXT NOT NULL REFERENCES import_batches(id));
      CREATE TABLE IF NOT EXISTS account_drafts(batch_id TEXT NOT NULL REFERENCES import_batches(id),id TEXT NOT NULL,company TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL CHECK(status='staged'),PRIMARY KEY(batch_id,id));
      CREATE TABLE IF NOT EXISTS source_files(batch_id TEXT NOT NULL REFERENCES import_batches(id),id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(batch_id,id));
    `);
    const batchId = key(JSON.stringify(plan));
    db.prepare('INSERT INTO import_batches VALUES(?,?,?) ON CONFLICT(id) DO NOTHING').run(batchId,plan.asOf,JSON.stringify(plan.summary));
    const put = db.prepare("INSERT INTO account_drafts VALUES(?,?,?,?,'staged') ON CONFLICT(batch_id,id) DO NOTHING");
    for (const account of plan.accounts) put.run(batchId,account.id,account.company,JSON.stringify(account));
    for (const file of plan.files) db.prepare('INSERT INTO source_files VALUES(?,?,?) ON CONFLICT(batch_id,id) DO NOTHING').run(batchId,file.id,JSON.stringify(file));
    db.prepare('INSERT INTO import_state VALUES(1,?) ON CONFLICT(singleton) DO UPDATE SET batch_id=excluded.batch_id').run(batchId);
    db.exec('COMMIT');
    return {batchId,accounts:plan.accounts.length,activeAccounts:0};
  } catch (error) { try {db.exec('ROLLBACK');} catch {} throw error; }
  finally {db.close();}
}
