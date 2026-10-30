# Fabric Display Quote Requests

`catalog-quotes.mjs` handles quote requests only for `custom-seg-fabric` and
`straight-tension-fabric-displays`. It never calls Shopify, changes inventory,
collects payment, creates an order, or starts production/fulfillment.

## Email And Storage

The recipient is fixed at `info@recognition-direct.com`. Sender settings use
`CATALOG_QUOTE_SMTP_HOST/PORT/USER/PASS` and `CATALOG_QUOTE_EMAIL_FROM`, falling
back to the existing `EXPRESS_ONE_SMTP_*` and `EXPRESS_ONE_EMAIL_FROM` values.
The Gmail app-password display spacing is normalized. SMTP requires TLS and
certificate validation. `CATALOG_QUOTE_ENABLED=false` disables receipt.
Express One code, records and settings are not changed by this feature.

Requests are stored in the private `data/catalog-quotes.sqlite` database on the
existing persistent disk. No customer data or file is served at a public URL.
One optional PDF, AI, EPS, PSD, JPG or PNG is accepted, up to 10 MiB, with a
matching file signature. These checks are not a malware scan. The file is sent
as a non-inline email attachment; after confirmed SMTP acceptance the local
file BLOB is removed while the request and filename/checksum remain. Pending
and failed file storage is capped at 100 MiB.

## Reliability And Privacy

A per-form UUID deduplicates repeated/concurrent submissions. Reusing a key for
changed content returns 409. Missing keys use a ten-minute content fingerprint
as a plain-form fallback. Known rejected emails can retry the same record;
timeouts, interrupted sends and other uncertain outcomes never resend
automatically. Customers see the reference and a direct-contact fallback.
SMTP acceptance confirms sending, not inbox placement or staff review.

The endpoint requires an approved Origin, validates fields/options server-side,
bounds multipart bodies and requests, and sends only to the fixed staff inbox.
Customer email is a validated Reply-To, not a new outbound recipient. No
customer autoresponder, external analytics or browser storage is added.

`GET /api/catalog-quote/status` exposes only readiness, supported product handles
and file limit. `POST /api/catalog-quote` returns a no-store receipt without PII.
Traditional form posts receive an HTML receipt; fetch requests receive JSON.

For recovery, authorized staff can inspect the private database in Render's
shell, including `id`, `state`, `created_at`, `error_category` and `payload` in
`catalog_quotes`. Check the inbox and reference before investigating an
`uncertain` request. Do not publicly export the database or blindly reset a
sending/uncertain state. No new public quote-administration portal was added.

## Tests And Rollback

Run `node --test`. Quote tests use an injected mail transport and never send
email or contact Shopify. Keep this handler deployed when publishing a theme
that uses its endpoint. To roll back, first restore the previous storefront
theme, then revert the quote feature commit if needed; retain the private
database until saved requests are reconciled. Do not roll back unrelated work.
