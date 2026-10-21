# Recognition Direct Banner Checkout

Creates exact-price Shopify draft-order checkout links for custom banners on Shopify Basic.

## Local run

```powershell
$env:MOCK_SHOPIFY="true"
node server.mjs
```

Open `http://localhost:8787/health`.

## Production setup

Deploy to Render with `render.yaml`, then set:

- `APP_BASE_URL`
- `SHOPIFY_SHOP=f375fe-2d`
- `SHOPIFY_CLIENT_ID`
- `SHOPIFY_CLIENT_SECRET`
- `MOCK_SHOPIFY=false`

The Shopify app needs `write_draft_orders`.

## Banner guide attribution

The guide's banner links use `rd_source=chatgpt-banner-guide`. The storefront
copies this allowlisted value into the 13oz banner form. The server adds the
`chatgpt-banner-guide` tag and an `Order Source: ChatGPT banner guide` line-item
attribute to that configuration and its combined Shopify draft order.

To measure sales, filter Shopify orders by that tag and Paid payment status.
Cart additions and draft checkout handoffs are not purchases. This is direct
guide-to-order attribution, not GA4 funnel tracking or persistent cross-session
attribution. Internal UTM parameters and analytics cookies are not added.

Run `node --test` to verify pricing, attribution, and cart offers without creating
real Shopify orders or sending customer messages.

## Consent-Based Acquisition Capture

The storefront loads `/order-attribution.js`. Only when Shopify's Customer
Privacy API permits analytics, it retains the first visit and most recent
external/campaign visit for up to 30 days. Ordinary internal navigation does not
overwrite the source. An internal ChatGPT banner guide visit is not an external
ChatGPT referral.

The script attaches `rd_attribution` to the existing custom-checkout forms.
Only public storefront paths, external referring hostnames, constrained campaign
tokens, and timestamps are accepted by the server. Query strings, fragments,
checkout/account links, and arbitrary fields are discarded. No analytics vendor
receives these fields. Consent denial clears this capture; the shared consent
cookie must still be allowed at final checkout or capture fields are removed.

Acquisition fields survive mixed carts as Shopify order-level custom attributes
and private per-item attributes (underscore-prefixed to avoid checkout clutter).
They are browser-reported evidence, not a replacement
for Shopify's native customer journey or GA4 attribution. Missing referral data
remains direct/unknown. Historical orders cannot be reconstructed by this change.
