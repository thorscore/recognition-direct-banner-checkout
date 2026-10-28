import nodemailer from 'nodemailer';
import { PortalError } from './express-one-store.mjs';

const email = value => typeof value === 'string' && /^[^\s<>@,;\r\n]+@[^\s<>@,;\r\n]+\.[^\s<>@,;\r\n]+$/.test(value);
const staff = actor => { if (actor?.role !== 'staff') throw new PortalError('Staff access required.',403); };

export function alertConfig(env,preview) {
  const recipient = env.EXPRESS_ONE_STAFF_EMAIL || 'info@recognition-direct.com';
  if (preview || env.EXPRESS_ONE_EMAIL_ENABLED !== 'true') return {enabled:false,state:preview ? 'preview':'not-connected'};
  const host = env.EXPRESS_ONE_SMTP_HOST || 'smtp.gmail.com', port = Number(env.EXPRESS_ONE_SMTP_PORT || 465);
  const user = env.EXPRESS_ONE_SMTP_USER, pass = env.EXPRESS_ONE_SMTP_PASS, from = env.EXPRESS_ONE_EMAIL_FROM || user;
  if (!/^[a-z0-9][a-z0-9.-]+[a-z0-9]$/i.test(host) || ![465,587].includes(port) || !email(user) || !pass || !email(from) || !email(recipient)) return {enabled:false,state:'configuration-error'};
  return {enabled:true,state:'connected',recipient,from,smtp:{host,port,secure:port === 465,requireTLS:true,
    auth:{user,pass},tls:{rejectUnauthorized:true,minVersion:'TLSv1.2'},
    connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000,
    disableFileAccess:true,disableUrlAccess:true,maxRecipients:1,logger:false,debug:false}};
}

function failure(error) {
  const known = ['EAUTH','EENVELOPE','EDNS','ECONNECTION','ECONNREFUSED','ESOCKET','ETIMEDOUT','EMESSAGE'];
  const category = known.includes(error?.code) ? error.code:'unknown';
  const uncertain = error?.command === 'DATA' || ['ESOCKET','ETIMEDOUT','unknown'].includes(category);
  return {category,uncertain,retry:!uncertain && ['EDNS','ECONNECTION','ECONNREFUSED'].includes(category)};
}

export class ExpressOneAlerts {
  constructor(store,{env = process.env,preview = false,base,transport,now = Date.now} = {}) {
    this.store = store; this.config = alertConfig(env,preview); this.base = base; this.now = now;
    this.closed = false; this.running = null; this.lastTest = null;
    if (this.config.enabled) this.transport = transport || nodemailer.createTransport(this.config.smtp);
    // A crash after SMTP acceptance cannot be distinguished from an unsent message.
    store.db.prepare("UPDATE request_alerts SET status='uncertain',error_category='interrupted' WHERE status='sending'").run();
  }
  status(actor) {
    staff(actor);
    return {state:this.config.state,enabled:this.config.enabled,recipient:this.config.enabled ? this.config.recipient:null,
      counts:this.store.alertSummary(actor),requests:this.store.alertRows(actor)};
  }
  message(request) {
    return {from:this.config.from,to:this.config.recipient,subject:'Express One: new badge request',
      messageId:`<express-one-${request.id}@${this.base.hostname}>`,
      text:`A new Express One badge request is awaiting staff approval.\n\nAccount: ${request.company}\nQuantity: ${request.quantity}\nDelivery: ${request.delivery === 'ship' ? 'Ship':request.delivery === 'pickup-la-mesa' ? 'La Mesa pickup':'Pine Valley pickup'}\nReference: ${request.id}\n\nReview privately: ${new URL('/express-one#requests',this.base).href}\n\nSign in to see names and delivery details. No payment, production, or shipment was triggered by this email.`};
  }
  async send(message) {
    const result = await this.transport.sendMail(message);
    if (!result.accepted?.some(address => typeof address === 'string' && address.toLowerCase() === this.config.recipient.toLowerCase())) throw Object.assign(new Error('Recipient not accepted'),{code:'EENVELOPE'});
  }
  start() {
    if (!this.config.enabled || this.closed) return;
    this.timer = setInterval(() => { void this.wake(); },30000); this.timer.unref();
    void this.wake();
  }
  wake() {
    if (!this.config.enabled || this.closed) return Promise.resolve();
    if (this.running) return this.running;
    this.running = this.drain().catch(() => {}).finally(() => { this.running = null; });
    return this.running;
  }
  async drain() {
    for (let index=0;index<10 && !this.closed;index++) {
      const request = this.store.transaction(() => {
        const row = this.store.db.prepare("SELECT r.id,r.quantity,r.delivery,r.status,a.company,n.attempts FROM request_alerts n JOIN requests r ON r.id=n.request_id JOIN accounts a ON a.id=r.account_id WHERE n.status='pending' AND n.next_attempt<=? ORDER BY n.rowid LIMIT 1").get(this.now());
        if (!row) return null;
        if (row.status !== 'requested') { this.store.db.prepare("UPDATE request_alerts SET status='skipped' WHERE request_id=?").run(row.id); return {skip:true}; }
        this.store.db.prepare("UPDATE request_alerts SET status='sending',attempts=attempts+1 WHERE request_id=?").run(row.id);
        return row;
      });
      if (!request) break;
      if (request.skip) continue;
      try {
        await this.send(this.message(request));
        this.store.db.prepare("UPDATE request_alerts SET status='sent',error_category='',sent_at=? WHERE request_id=?").run(new Date(this.now()).toISOString(),request.id);
      } catch (error) {
        const outcome = failure(error), retry = outcome.retry && request.attempts<4;
        this.store.db.prepare('UPDATE request_alerts SET status=?,error_category=?,next_attempt=? WHERE request_id=?').run(outcome.uncertain ? 'uncertain':retry ? 'pending':'failed',outcome.category,this.now()+Math.min(3600000,60000*2**request.attempts),request.id);
      }
    }
  }
  async test(actor) {
    staff(actor);
    if (!this.config.enabled) throw new PortalError('Connect the email sender securely in Render before sending a test.',409);
    if (this.lastTest !== null && this.now()-this.lastTest<60000) throw new PortalError('Please wait one minute before another test email.',429);
    this.lastTest = this.now();
    try {
      await this.send({from:this.config.from,to:this.config.recipient,subject:'Express One staff alert test',text:`Express One staff email is connected.\n\nOpen the private portal: ${new URL('/express-one#requests',this.base).href}\n\nThis is a test only. No badge request, stock change, invoice, or shipment was created.`});
      return {ok:true,accepted:true,recipient:this.config.recipient};
    } catch { throw new PortalError('The email server did not confirm acceptance. Check the sender settings before trying again.',502); }
  }
  async retry(actor,id) {
    staff(actor);
    if (!this.config.enabled) throw new PortalError('Connect the email sender first.',409);
    const updated = this.store.db.prepare("UPDATE request_alerts SET status='pending',attempts=0,next_attempt=0,error_category='' WHERE request_id=? AND status='failed'").run(id);
    if (!updated.changes) throw new PortalError('Only failed alerts can be retried. Check the inbox before investigating an uncertain delivery.',409);
    this.store.event(actor,'request-alert-retried',id);
    void this.wake(); return {ok:true};
  }
  async close() { this.closed = true; clearInterval(this.timer); if (this.running) await this.running; this.transport?.close?.(); }
}
