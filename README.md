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
