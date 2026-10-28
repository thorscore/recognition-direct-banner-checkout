# Express One Private Pilot

This implementation is not a public launch. The local preview uses sample data,
binds only to `127.0.0.1`, and has separate storage from live customers and orders.
No payment, shipment, customer invitation, invoice email, or Shopify order is created.

## Preview

Run `npm install` and `npm run express-one:preview` with Node 22.13 or newer.
Open `http://127.0.0.1:8791/express-one`.
The preview offers two customer identities and a staff identity. These buttons
exist only in loopback preview mode; public origins and production reject it.
`EXPRESS_ONE_PREVIEW_PORT` can select another local port.

Sample inventory persists in `data/express-one-private-preview.sqlite`.
The live database is a separate `data/express-one-v2.sqlite` file.
The old JSON customer/release files are not imported, overwritten, or migrated.

## Workflow

- An operator verifies a paid order and the actual held stock before adding a lot.
- A customer submits names for an owned lot, with shipping or a pickup location.
  TXT and CSV are supported; CSV headers are `Name` and optional `Title`.
- Pending and approved requests reserve badges. They do not deduct on-hand stock.
- Staff approve or reject; customers can cancel requests awaiting approval.
- Staff mark an approved release shipped, entering the actual shipping charge,
  or ready for pickup with zero shipping. This atomically deducts inventory and
  creates one shipping entry. Ready for pickup does not mean collected.
- Shipping accrues against the original stock lot. Only charges for depleted
  lots become ready to invoice. Staff record an invoice reference after creating
  the invoice in their existing billing system. This does not send invoices,
  record customer payment, or integrate with QuickBooks.

Request idempotency keys prevent double reservations after a retry. Transactions
protect stock, fulfillment, invoice linkage and audit events from partial writes.
Repeated fulfillment is rejected instead of charging shipping or deducting twice.

## Shopify Sign-In Before Live Use

Read-only account check on October 28, 2026 confirmed `NEW_CUSTOMER_ACCOUNTS`,
visible login links and optional checkout login. No account setting was changed.
The store's public discovery metadata advertises issuer
`https://shopify.com/authentication/86557622568`, RS256 signing and S256 PKCE,
matching the configured implementation. Discovery alone is not a completed login.

After separate merchant approval on October 28, Shopify's free official Headless
channel was installed and one storefront, `Express One private portal` (412911),
was created. Its Customer Account client is Confidential, with the exact callback
`https://checkout.recognition-direct.com/express-one/callback` saved. Client ID:
`26013241-187e-4853-8c43-021c83e4860f`. After separate approval, the dedicated client
ID and secret were transferred directly into the existing Render service's
`EXPRESS_ONE_OIDC_*` environment entries. The issuer was also saved, with
`EXPRESS_ONE_ENABLED=false`. Render's **Save only** action was used: no deploy or
restart. The secret was not printed in chat or written to local/source files.

Shopify rejected an empty permission set. The only saved Customer Account API
permission is `customer_read_customers`; profile editing, orders, draft orders,
store credit, markets, companies, subscriptions and metaobjects are off. The
application still requests only `openid email` and makes no Customer Account API
queries. No products were published to Headless, and no Storefront API tokens were
copied or used. The storefront container generates Storefront API credentials too;
this does not constitute a second public storefront or a portal deployment.

After further merchant approval on October 28, commit
`9e8e7e25f551b683aba8e94b33d4b9067ac8a423` was deployed to the existing Render
service. Its build uses `npm ci --omit=dev`; the verified runtime is Node 22.23.4.
`EXPRESS_ONE_ENABLED=true` is now applied for the private identity test. The live
sign-in page and redirect to the dedicated Shopify client were checked. The later
confidential-client fix in `6259d06b` passed the merchant's real email-code login.
Only the merchant's verified identity was linked to a private Fairfield-form pilot.
After online backups, the approved form details and gold/silver examples were added,
then the merchant confirmed 100 prepaid badges in one shared color balance. This
opening balance is owner-confirmed, not an invented Shopify order number. No actual
Fairfield customer identities, historical workbook transactions, invitations, or
payments were imported. Staff access requires a separately approved exact allowlist.

The `openid-client` integration uses a confidential OpenID Connect client with
PKCE S256, random state and nonce, signature verification, issuer/audience/expiry
checks and a one-use callback. Only the verified issuer/subject is retained;
access/refresh/ID tokens are not exposed to the browser or stored in the portal.

Shopify's confidential token exchange requires `client_id` in the form body and
raw Base64 `client_id:client_secret` in its Basic header. The default library Basic
adapter omits the body ID and percent-encodes punctuation in the header credentials.
The Shopify-specific authentication callback follows the official request format;
the rest of the library's token, PKCE and ID-token validation remains unchanged.
Regression tests assert the exact header, body client ID, redirect, grant type and
absence of a body client secret. Credentials were privately compared with Shopify
and matched; no rotation, permission expansion or secret rewrite was needed.

Setup must be reviewed and approved by the merchant before creating or expanding
Customer Account API access, changing customer account settings, or adding any
operator identity. Do not put secrets into chat or source control.

1. Confirm Shopify customer accounts are enabled and choose the supported
   Customer Account client configuration for this store. Shopify's official
   setup supports confidential clients for a server-side application.
2. Register the exact HTTPS callback on the existing checkout host:
   `https://checkout.recognition-direct.com/express-one/callback`.
   Do not register the local preview; Shopify does not accept localhost callbacks.
3. Configure the verified discovery issuer, confidential client ID and secret in
   the host's environment using the `EXPRESS_ONE_OIDC_*` variables. These are
   separate from the Admin API credentials. The identity-only flow requests
   `openid email`, not store-wide Admin access or customer account mutations.
4. With the portal enabled only in an isolated private HTTPS deployment, test
   real sign-in and the callback, including
   the shop's actual issuer, signing algorithm, authorized redirect and CSP.
   The automated tests use a signed mock provider; they do not prove this store's
   real Shopify setup works yet.
5. A first verified sign-in without a provisioned account receives no inventory.
   Its opaque reference is recorded in the private `identities` table. An operator
   must verify the person's identity and paid-order relationship before binding it.
   Use the local, trusted-server tool to inspect verified references:
   `node express-one-admin.mjs identities --database PATH_TO_DATABASE`.
   Provision the verified customer with:
   `node express-one-admin.mjs add-account --database PATH_TO_DATABASE --reference REFERENCE --company "COMPANY"`.
6. Add the merchant's exact verified issuer/subject to
   `EXPRESS_ONE_OPERATOR_IDENTITIES` as a JSON array of `{ "issuer": "...", "subject": "..." }`.
   Never grant staff access by an unverified email, customer-supplied ID or URL code.
7. After reviewing the account binding and pilot data, enable
   `EXPRESS_ONE_ENABLED=true` on the intended live host. Invite one customer only after the full HTTPS
   sign-in, isolation and release cycle have passed live checks.

The production handler fails closed without sign-in configuration. The deployed
main-server guard blocks all legacy URL-code login and release routes, even if the
old prototype functions remain in `server.mjs`. Do not share old prototype links.

## Deployment and Operations

- The implementation was developed on `express-one-private-pilot` and then deployed
  to `main` for the approved private sign-in test. Customer provisioning remains off.
- The Render service already declares a persistent disk mounted at
  `/opt/render/project/src/data`; verify the actual service mount before enabling
  the portal. SQLite must live on that disk. Use one service instance, not multiple
  writers on separate filesystems. Check the actual Node runtime is 22.13+.
- Use SQLite's online backup API for database backups, not a live file copy of
  a WAL database. Verify restoration in an isolated environment before a pilot.
  Do not deploy against the sample-data database or automatically migrate the old
  JSON inventory. Reconcile quantities and open requests with the merchant first.
- Sessions use random opaque cookies (HttpOnly, Secure in live mode, SameSite=Lax),
  rotate after login and expire after 30 minutes. Sessions are held in memory;
  a restart signs everyone out without deleting inventory or request history.
- Mutations require the exact origin and a session CSRF token. Private pages/API
  responses are no-store and noindex, with CSP and a strict-origin referrer policy.
  Browser form posts need an Origin header, which `no-referrer` can suppress.
- The five-minute authorization window is separate from the 30-minute session.
  Expired, missing-cookie and unstarted callbacks show specific restart guidance.
  Failure logs contain only a short support reference, known reason/error categories
  and processing stage. Raw errors, callback URLs, codes, tokens and secrets are
  never logged. Signature, state, nonce, issuer, audience and expiry checks remain
  mandatory; a successful identity still receives no stock without staff setup.
- Badge names are bounded private database records, not publicly served uploads.
  The UI renders customer text with DOM text nodes rather than HTML strings.
- Optional staff request emails use the private SQLite outbox described below.
  There is no customer enrollment, carrier purchase, tracking lookup, paid-order
  webhook, customer email, or external invoice call. Email never approves a request
  or triggers production, payment, stock deduction, or shipment.
- Request and shipping history currently show the latest 500 records per view;
  inventory and uninvoiced shipping totals are computed across all records.

## Staff View and Request Alerts

Staff still authenticate through the same verified Shopify identity flow. The exact
issuer/subject must be approved in `EXPRESS_ONE_OPERATOR_IDENTITIES`; an email address
or customer-submitted role never grants staff access. An operator with a linked
customer pilot can use **View as customer** and **Back to staff**. Customer mode is
scoped only to that identity's own account, not an arbitrary company or customer ID.
Staff APIs remain unavailable in customer mode. Ordinary customers cannot switch
to staff. The staff queue refreshes every 30 seconds while visible, except while a
dialog or expanded request detail is open.

New request and email-outbox rows are committed in one transaction. Duplicate request
keys do not create duplicate emails. Existing historical requests are not backfilled.
Alerts are off by default and always off in loopback preview, even if SMTP variables
are present. Without a sender, the staff screen explicitly says email is not connected;
saved requests and their pending alerts remain available.

Configure only in the existing server's secret environment, never chat or Git:

- `EXPRESS_ONE_EMAIL_ENABLED=true` only when ready for a sender test.
- `EXPRESS_ONE_STAFF_EMAIL=info@recognition-direct.com` is the one fixed recipient.
- `EXPRESS_ONE_SMTP_HOST=smtp.gmail.com` and `EXPRESS_ONE_SMTP_PORT=465` for Google.
  Port 587 with mandatory STARTTLS is also supported. Port 25 is not supported.
- `EXPRESS_ONE_SMTP_USER` is the actual sending mailbox sign-in, not an unverified alias.
- `EXPRESS_ONE_SMTP_PASS` is the dedicated sender credential, entered by the merchant
  directly in Render. Do not request a normal Google password or any code in chat.
- `EXPRESS_ONE_EMAIL_FROM` defaults to the sending mailbox; use an alias only after
  confirming that mailbox is authorized to send it.

Google app passwords require 2-Step Verification and may be unavailable under the
organization's policy. The merchant must create, enter, or rotate credentials.
Prefer an existing restricted sending identity over exposing a personal mailbox.
If Google does not permit this connection, use an approved OAuth/transactional-mail
setup separately; do not weaken account security or add paid services automatically.
Official setup: https://support.google.com/accounts/answer/185833
SMTP/TLS reference: https://nodemailer.com/smtp

Use **Send test email** from staff view and verify actual receipt. SMTP acceptance is
not proof of inbox delivery. Tests are staff-only, rate limited to one per minute,
and cannot choose recipients or change inventory. New-request email contains only
company, quantity, delivery choice, reference, and a sign-in link to the request queue.
Badge names, property addresses, contact details, uploads, and tokens stay in the portal.
SMTP debug logging and filesystem/URL attachment access are disabled; TLS certificate
verification is mandatory. Invalid/partial configuration leaves the sender disabled
without breaking checkout or discarding requests.

Safe connection failures retry with backoff, up to five attempts. Authentication or
recipient failures remain visible as failed; staff may retry them after fixing the
sender. Timeouts during delivery and interrupted in-flight sends are marked uncertain
and never automatically resent. Check the inbox before a trusted operator investigates
those rows; SMTP cannot provide exactly-once delivery across crashes. Stable message
IDs help investigation but do not guarantee recipient deduplication. Raw mail errors,
credentials, and recipient details are not stored in diagnostic categories.

## Legacy Workbook Account Drafts

`express-one-import.mjs` converts extracted, fingerprinted workbook data into a
versioned **separate staging database**. It never creates live accounts, identities,
available stock, charges, invoices or release requests. The merchant approved
using final source balances as draft opening quantities, with exceptions flagged.
Negative/missing balances, overlapping ledger versions, separate worksheet stock
sections, reconciliation failures and special products stay held. Reviewed,
distinct styles stay separate; their balances are never combined automatically.

Real workbook extracts, account mappings, contact details and the staging database
live outside this repository in the private work folder. Customer-specific mapping
exceptions are supplied as data, not hardcoded into application source. Historical
shipping values remain references, not new amounts owed. Source dates, formulas,
cached values and source-cell references are preserved without changing Excel files.

Run `node express-one-import-preview.mjs --database ABSOLUTE_STAGING_DATABASE_PATH`
for a read-only staff review at `http://127.0.0.1:8792/`. This tool binds loopback
only, rejects production mode, wrong hosts and all writes, and does not serve
source workbooks or the database. These local account URLs are **not customer
login links**. Confirm authorized contacts, inventory exceptions and verified
Shopify identities before migrating any account into the actual portal.

## Customer Order Form Profiles

The optional `property-domed` account profile preserves an approved property-badge
format: first names, separate Gold/Silver quantities, and all nine property/contact
fields. Profiles are stored per account, not selected by customer-supplied company
IDs. The server enforces each badge finish and required field, retains these details
on the request, and includes them in retry checks. Profile-specific CSV files require
`Name,Finish`, one row per badge; a Quantity column is rejected rather than ignored.

Gold, silver and logo PNG examples are stored privately per account. Image requests
require the owning customer session or staff; they are not public file uploads.
Support contact is `info@recognition-direct.com`, (619) 465-0055. No email is sent.
The source form supplies no price or inventory, so neither is inferred from it.

For local review only, `EXPRESS_ONE_PREVIEW_PROFILE_FILE` can load a private profile
JSON containing `company`, `profile`, and optional PNG paths in `images`. This adds
a separate sample account and 40 explicitly labeled sample badges, never live stock.
Real source documents, examples and customer profile files stay outside Git.
`express-one-import-preview.mjs --profiles PATH` can attach profiles by draft account
ID to its read-only review; this does not modify or activate the staging accounts.

## Test Coverage

`npm test` includes the existing banner, sign, badge, pricing and acquisition tests,
plus portal domain, HTTP and signed-provider authentication tests. The new tests
cover isolation, CSRF, invalid roles, legacy URL-code routes, replay, reservations,
duplicate requests/fulfillment, actual shipping, pickup semantics and invoicing.

Sources:
- https://shopify.dev/docs/storefronts/headless/building-with-the-customer-account-api/getting-started
- https://shopify.dev/docs/api/customer/2026-10#obtain-access-token
- https://github.com/panva/openid-client
- https://nodejs.org/docs/latest-v22.x/api/sqlite.html
- https://render.com/docs/disks
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy
