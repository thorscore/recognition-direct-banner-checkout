import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import * as oidc from 'openid-client';
import { PortalError } from './express-one-store.mjs';

export const randomToken = () => randomBytes(32).toString('base64url');
export const identityKey = identity => `${identity.issuer}|${identity.subject}`;
export const identityReference = identity => createHash('sha256').update(identityKey(identity)).digest('hex').slice(0,20);
const loopback = host => ['127.0.0.1','localhost','[::1]'].includes(host);

export function portalConfig(env = process.env) {
  const preview = env.EXPRESS_ONE_PREVIEW === 'true';
  const base = new URL(env.APP_BASE_URL || 'http://127.0.0.1:8791');
  if (base.pathname !== '/' || base.search || base.hash || base.username || base.password) throw new Error('Portal base URL must be an origin.');
  if (preview && (!loopback(base.hostname) || env.NODE_ENV === 'production')) throw new Error('Preview mode is restricted to a local sample-data server.');
  if (!preview && base.protocol !== 'https:') throw new Error('Live portal requires HTTPS.');
  let operators;
  try { operators = JSON.parse(env.EXPRESS_ONE_OPERATOR_IDENTITIES || '[]'); } catch { throw new Error('Operator identities must be a JSON array.'); }
  if (!Array.isArray(operators) || operators.some(item => typeof item.issuer !== 'string' || typeof item.subject !== 'string')) throw new Error('Configure exact verified operator identities.');
  return { preview, base, issuer:env.EXPRESS_ONE_OIDC_ISSUER || '', clientId:env.EXPRESS_ONE_OIDC_CLIENT_ID || '', clientSecret:env.EXPRESS_ONE_OIDC_CLIENT_SECRET || '', operators:new Set(operators.map(identityKey)) };
}

export class PortalSessions {
  constructor(config, { now = Date.now, ttl = 30*60*1000 } = {}) {
    this.config = config; this.now = now; this.ttl = ttl; this.sessions = new Map();
    this.cookieName = config.preview ? 'eo_preview_session':'__Host-eo_session';
  }
  cookie(id, expired = false) {
    return `${this.cookieName}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${expired ? 0:Math.floor(this.ttl/1000)}${this.config.preview ? '':'; Secure'}`;
  }
  removeExpired() {
    for (const [id,session] of this.sessions) if (session.expires <= this.now()) this.sessions.delete(id);
  }
  get(req, res, create = false) {
    this.removeExpired();
    const id = String(req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${this.cookieName}=`))?.slice(this.cookieName.length+1);
    let session = /^[\w-]{43}$/.test(id || '') ? this.sessions.get(id):null;
    if (!session && create) {
      if (this.sessions.size >= 2000) throw new PortalError('Sign-in is busy. Please try later.',503);
      session = { id:randomToken(),csrf:randomToken(),expires:this.now()+this.ttl };
      this.sessions.set(session.id,session);
      res.setHeader('Set-Cookie',this.cookie(session.id));
    }
    return session;
  }
  rotate(session, identity, res) {
    this.sessions.delete(session.id);
    const next = { id:randomToken(),csrf:randomToken(),identity,expires:this.now()+this.ttl };
    this.sessions.set(next.id,next);
    res.setHeader('Set-Cookie',this.cookie(next.id));
    return next;
  }
  logout(session, res) {
    if (session) this.sessions.delete(session.id);
    res.setHeader('Set-Cookie',this.cookie('',true));
  }
}

export function checkPortalHost(req, config) {
  if (req.headers.host !== config.base.host) throw new PortalError('Invalid portal host.',400);
  if (config.preview && !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) throw new PortalError('Preview is local only.',403);
}

export function checkMutation(req, config, session, body) {
  if (req.headers.origin !== config.base.origin) throw new PortalError('Request origin is not allowed.',403);
  const token = req.headers['x-csrf-token'] || body?.csrf;
  if (!session || typeof token !== 'string' || !/^[\w-]{43}$/.test(token) || !timingSafeEqual(Buffer.from(token),Buffer.from(session.csrf))) throw new PortalError('The session has changed. Reload the page.',403);
}

export class ShopifyPortalIdentity {
  constructor(config, options = {}) { this.config = config; this.discoveryOptions = options; }
  async configuration() {
    if (!this.config.issuer || !this.config.clientId || !this.config.clientSecret) throw new PortalError('Customer sign-in has not been configured.',503);
    if (!this.pending) {
      this.pending = oidc.discovery(new URL(this.config.issuer),this.config.clientId,{ id_token_signed_response_alg:'RS256' },oidc.ClientSecretBasic(this.config.clientSecret),{...this.discoveryOptions,execute:[oidc.enableNonRepudiationChecks]}).catch(error => { this.pending = null; throw error; });
    }
    return this.pending;
  }
  async begin(session) {
    const config = await this.configuration();
    const verifier = oidc.randomPKCECodeVerifier(), state = oidc.randomState(), nonce = oidc.randomNonce();
    session.authorization = { verifier,state,nonce,expires:Date.now()+5*60*1000 };
    return oidc.buildAuthorizationUrl(config,{redirect_uri:new URL('/express-one/callback',this.config.base).href,response_type:'code',scope:'openid email',state,nonce,code_challenge:await oidc.calculatePKCECodeChallenge(verifier),code_challenge_method:'S256'});
  }
  async complete(session, url) {
    const authorization = session?.authorization;
    if (session) delete session.authorization;
    if (!authorization || authorization.expires <= Date.now()) throw new PortalError('Sign-in expired. Please start again.',401);
    const config = await this.configuration();
    const tokens = await oidc.authorizationCodeGrant(config,url,{pkceCodeVerifier:authorization.verifier,expectedState:authorization.state,expectedNonce:authorization.nonce,idTokenExpected:true});
    const claims = tokens.claims();
    if (!claims?.sub || claims.iss !== config.serverMetadata().issuer) throw new PortalError('Customer sign-in could not be verified.',401);
    return {issuer:claims.iss,subject:claims.sub};
  }
}

export function portalActor(session, config, store) {
  if (!session?.identity) throw new PortalError('Sign in to continue.',401);
  const identity = session.identity;
  if (config.preview && identity.issuer === 'preview' && identity.subject === 'preview-staff' || config.operators.has(identityKey(identity))) return {...identity,role:'staff'};
  const account = store.accountForIdentity(identity);
  if (!account) throw new PortalError(`Your Express One account needs staff setup. Reference: ${identityReference(identity)}.`,403);
  return {...identity,role:'customer',accountId:account.id};
}
