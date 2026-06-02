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
