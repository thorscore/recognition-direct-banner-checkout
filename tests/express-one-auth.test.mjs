import assert from 'node:assert/strict';
import test from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import * as oidc from 'openid-client';
import { PortalSessions, ShopifyPortalIdentity, portalConfig, portalActor, checkMutation, checkPortalHost } from '../express-one-auth.mjs';

test('preview cannot be configured on a public origin or in production; live requires HTTPS',() => {
  for (const env of [{APP_BASE_URL:'https://public.example',EXPRESS_ONE_PREVIEW:'true'},{APP_BASE_URL:'http://127.0.0.1:8791',EXPRESS_ONE_PREVIEW:'true',NODE_ENV:'production'},{APP_BASE_URL:'http://public.example'},{APP_BASE_URL:'https://public.example/path'}]) assert.throws(() => portalConfig(env));
});
test('sessions rotate after sign-in, expire, and cannot be revived after logout',() => {
  let now = 0; const config = portalConfig({APP_BASE_URL:'https://portal.example'});
  const sessions = new PortalSessions(config,{now:() => now,ttl:1000}); const headers = {}; const res = {setHeader:(k,v) => {headers[k] = v;}};
  const session = sessions.get({headers:{}},res,true); const cookie = headers['Set-Cookie'];
  assert.match(cookie,/HttpOnly; SameSite=Lax/); assert.match(cookie,/; Secure/);
  const next = sessions.rotate(session,{issuer:'https://issuer.example',subject:'one'},res);
  assert.equal(sessions.get({headers:{cookie}},res),undefined);
  const signedCookie = headers['Set-Cookie']; assert.equal(sessions.get({headers:{cookie:signedCookie}},res).id,next.id);
  now = 1001; assert.equal(sessions.get({headers:{cookie:signedCookie}},res),undefined);
});
test('cross-site mutations, forged CSRF, wrong hosts, and public preview requests fail',() => {
  const config = portalConfig({APP_BASE_URL:'http://127.0.0.1:8791',EXPRESS_ONE_PREVIEW:'true'});
  const sessions = new PortalSessions(config), session = sessions.get({headers:{}},{setHeader(){}},true);
  assert.throws(() => checkMutation({headers:{origin:'https://evil.example','x-csrf-token':session.csrf}},config,session,{}),/origin/);
  assert.throws(() => checkMutation({headers:{origin:config.base.origin,'x-csrf-token':'é'.repeat(43)}},config,session,{}),/session/);
  assert.throws(() => checkPortalHost({headers:{host:'evil.example'},socket:{remoteAddress:'127.0.0.1'}},config),/host/);
  assert.throws(() => checkPortalHost({headers:{host:config.base.host},socket:{remoteAddress:'192.0.2.1'}},config),/local only/);
});
test('customer IDs in a request cannot select the logged-in identity or staff role',() => {
  const config = portalConfig({APP_BASE_URL:'https://portal.example',EXPRESS_ONE_OPERATOR_IDENTITIES:JSON.stringify([{issuer:'https://issuer.example',subject:'operator'}])});
  const store = {accountForIdentity:identity => identity.subject === 'one' ? {id:'account-one'}:null};
  assert.equal(portalActor({identity:{issuer:'https://issuer.example',subject:'one'}},config,store).accountId,'account-one');
  assert.throws(() => portalActor({identity:{issuer:'https://evil.example',subject:'operator'}},config,store),/staff setup/);
  assert.equal(portalActor({identity:{issuer:'https://issuer.example',subject:'operator'}},config,store).role,'staff');
});

async function oidcFixture(mode = 'valid') {
  const issuer = 'https://shopify.test/oidc', keys = await generateKeyPair('RS256'), otherKeys = await generateKeyPair('RS256');
  const jwk = {...await exportJWK(keys.publicKey),kid:'test-key',alg:'RS256',use:'sig'};
  const config = {base:new URL('https://portal.test'),issuer,clientId:'test-client',clientSecret:'test-secret'};
  let expected;
  const provider = new ShopifyPortalIdentity(config,{[oidc.customFetch]:async (url,options) => {
    if (String(url).endsWith('/.well-known/openid-configuration')) return Response.json({issuer,authorization_endpoint:`${issuer}/authorize`,token_endpoint:`${issuer}/token`,jwks_uri:`${issuer}/jwks`,response_types_supported:['code'],subject_types_supported:['public'],id_token_signing_alg_values_supported:['RS256'],code_challenge_methods_supported:['S256']});
    if (String(url).endsWith('/jwks')) return Response.json({keys:[jwk]});
    if (String(url).endsWith('/token')) {
      const body = new URLSearchParams(options.body); assert.equal(body.get('code_verifier'),expected.verifier);
      assert.ok(new Headers(options.headers).get('authorization').startsWith('Basic '));
      const token = await new SignJWT({nonce:mode === 'nonce' ? 'WRONG':expected.nonce}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuer(mode === 'issuer' ? 'https://evil.test':issuer).setAudience(mode === 'audience' ? 'WRONG':config.clientId).setSubject('customer-one').setIssuedAt().setExpirationTime(mode === 'expired' ? Math.floor(Date.now()/1000)-600:'5m').sign(mode === 'signature' ? otherKeys.privateKey:keys.privateKey);
      return Response.json({access_token:'test-access',token_type:'Bearer',expires_in:300,id_token:token});
    }
    throw new Error('Unexpected network request');
  }});
  const session = {}; const authorizationUrl = await provider.begin(session); expected = {...session.authorization};
  return {provider,session,authorizationUrl,callback:new URL(`https://portal.test/express-one/callback?code=TEST&state=${expected.state}`)};
}
test('Shopify OIDC verifies signatures, issuer, audience, nonce, state, PKCE, and one-use callbacks',async () => {
  const valid = await oidcFixture();
  assert.equal(valid.authorizationUrl.searchParams.get('code_challenge_method'),'S256');
  assert.equal(valid.authorizationUrl.searchParams.get('scope'),'openid email');
  assert.equal(valid.authorizationUrl.searchParams.has('code_verifier'),false);
  assert.deepEqual(await valid.provider.complete(valid.session,valid.callback),{issuer:'https://shopify.test/oidc',subject:'customer-one'});
  await assert.rejects(valid.provider.complete(valid.session,valid.callback),/expired/);
  for (const mode of ['signature','nonce','audience','issuer','expired']) {
    const invalid = await oidcFixture(mode); await assert.rejects(invalid.provider.complete(invalid.session,invalid.callback),undefined,mode);
  }
  const state = await oidcFixture(); state.callback.searchParams.set('state','WRONG'); await assert.rejects(state.provider.complete(state.session,state.callback));
});
