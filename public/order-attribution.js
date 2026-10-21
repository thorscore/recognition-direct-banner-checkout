(function () {
  'use strict';
  if (window.rdOrderAttribution) return;
  var key = 'rdAcquisitionV1';
  var ttl = 30 * 24 * 60 * 60 * 1000;
  var startedAt = new Date().toISOString();
  var page = window.location.href;
  var referrer = document.referrer;
  var state = null;
  var storeHosts = ['recognition-direct.com', 'www.recognition-direct.com'];
  var internalHosts = storeHosts.concat(['checkout.recognition-direct.com', 'recognition-direct.bs.run', 'shop.app']);

  function allowed() {
    try { return !window.Shopify.designMode && window.Shopify.customerPrivacy.analyticsProcessingAllowed() === true; }
    catch (_) { return false; }
  }
  function consentCookie(value) {
    if (storeHosts.indexOf(window.location.hostname) < 0) return;
    try { document.cookie = 'rd_acquisition_consent=' + value + '; Domain=recognition-direct.com; Path=/; Secure; SameSite=Lax; Max-Age=2592000'; } catch (_) {}
  }
  function forget() {
    state = null;
    try { window.localStorage.removeItem(key); } catch (_) {}
    consentCookie('denied');
  }
  function publicPage(value) {
    try {
      var url = new URL(value);
      if (url.protocol !== 'https:' || storeHosts.indexOf(url.hostname) < 0 || url.username || url.password || url.port) return '';
      if (!/^\/(?:$|(?:products|pages|collections)\/[a-z0-9-]+\/?$|blogs\/[a-z0-9-]+(?:\/[a-z0-9-]+)?\/?$)/.test(url.pathname)) return '';
      return 'https://recognition-direct.com' + url.pathname;
    } catch (_) { return ''; }
  }
  function token(value) { return typeof value === 'string' && /^[a-z0-9][a-z0-9_. -]{0,99}$/i.test(value) ? value : ''; }
  function externalHost(value) {
    try {
      var url = new URL(value);
      if (!/^https?:$/.test(url.protocol) || internalHosts.indexOf(url.hostname) >= 0 || url.hostname.endsWith('.myshopify.com')) return '';
      return url.hostname;
    } catch (_) { return ''; }
  }
  function validTouch(visit) {
    if (!visit || !publicPage(visit.landingPage)) return false;
    var at = Date.parse(visit.at);
    return Number.isFinite(at) && at >= Date.now() - ttl && at <= Date.now() + 300000;
  }
  function capture() {
    if (!allowed()) { forget(); return null; }
    consentCookie('allowed');
    var landingPage = publicPage(page);
    if (!landingPage) return state;
    var url = new URL(page);
    var visit = {
      at: startedAt, landingPage: landingPage, referrerHost: externalHost(referrer),
      utmSource: token(url.searchParams.get('utm_source')),
      utmMedium: token(url.searchParams.get('utm_medium')),
      utmCampaign: token(url.searchParams.get('utm_campaign'))
    };
    if (!state) {
      try {
        var stored = JSON.parse(window.localStorage.getItem(key));
        if (stored?.version === 1 && stored.consent === 'allowed' && validTouch(stored.first) && validTouch(stored.last) && stored.first.at <= stored.last.at) state = stored;
      } catch (_) {}
    }
    if (!state) state = { version: 1, consent: 'allowed', first: visit, last: visit };
    else if (visit.referrerHost || visit.utmSource) state.last = visit;
    try { window.localStorage.setItem(key, JSON.stringify(state)); } catch (_) {}
    return state;
  }
  function payload() {
    if (!allowed()) { forget(); return { version: 1, consent: 'denied' }; }
    var data = capture();
    return data ? { ...data, orderPage: publicPage(window.location.href) } : null;
  }
  document.addEventListener('formdata', function (event) {
    try {
      var action = new URL(event.target.action, window.location.href);
      if (action.origin !== 'https://checkout.recognition-direct.com' || !/^\/api\/(banner|catalog|name-badge|solar-placard|premier-award|polar-camel)-checkout$/.test(action.pathname)) return;
      var data = payload();
      if (data) event.formData.set('rd_attribution', JSON.stringify(data));
    } catch (_) {}
  }, true);
  document.addEventListener('visitorConsentCollected', capture);
  window.rdOrderAttribution = { version: 1, payload: payload };
  if (window.Shopify?.customerPrivacy) capture();
  else {
    try {
      window.Shopify?.loadFeatures([{ name: 'consent-tracking-api', version: '0.2' }], function (error) {
        if (!error) capture();
      });
    } catch (_) {}
  }
})();
