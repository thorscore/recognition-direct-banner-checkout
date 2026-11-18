# Private shipping phone preview

Temporary sample-only checkout and owner shipping approval. This is a separate service; there are no Shopify credentials, checkout transports, orders, payments, notifications or label purchases.

Uses the candidate shipping calculation, validation and SQLite approval modules. The observed rate snapshot is supplied privately as PREVIEW_RATES_GZIP; never commit rates, access keys, carts, or customer data. PREVIEW_ACCESS_KEY must be a strong random secret. PREVIEW_EXPIRES_AT is an absolute millisecond timestamp. Node 22.23.5 is required for the existing SQLite API.

Owner and customer private links establish signed HttpOnly role cookies. Only the owner role can read or approve the queue. Mutations require same-origin requests and a session CSRF token. Access is temporary and rate expiry is enforced without inventing fresh observations.

The approval practice case deliberately holds a supported package. The owner can approve only its existing complete-cart Shopify quote to the fixed sample destination while that evidence is fresh. 48 × 36 panels have no approval evidence and remain quote-only. Larger rigid signs are pickup-only.

Free hosting is temporary: carts and approvals may reset on idle, restart or redeploy. This service is for immediate fictional testing, never a production order queue.

Run tests with PREVIEW_TEST_SNAPSHOT pointing to the validated private JSON rate snapshot. Run node server.mjs with the private environment settings. Do not connect real payment or Shopify write transports.
