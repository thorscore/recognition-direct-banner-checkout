# Owner-only tumbler proof preview

This is a private integration preview. Enable only with
`TUMBLER_PRIVATE_PREVIEW_ENABLED=true` on the existing checkout service.
It reuses the existing persistent data directory, app GraphQL transport, and
Recognition Direct sender. No additional service or secret is required.

- Owner access uses a separate eight-digit email code and cookie namespace.
- Only `roth@recognition-direct.com` receives sign-in and proof emails.
- `/private-tumbler/webhooks` verifies the existing app's raw-body signature.
  Unmarked orders are ignored. Marked private orders are durably queued before
  acknowledgement and independently read from Shopify before linking a design.
- The receiver connector registers only paid, cancelled, and refund topics for
  this exact endpoint, using the backend app's own identity.
- The private save response supplies a saved record and cart-item reference.
  The unpublished theme retains those on each native cart line.
- Simulated payments use separate keys, immutable source snapshots, and SQLite
  databases. They never write paid status to the original saved order.
- The two-unit proof rehearsal reuses previously observed checkout amounts; it
  does not supply a rate to checkout. Native checkout continues to calculate
  shipping. No markup, handling, profile, package, or pickup mutation exists.
- A current PDF must be reviewed before it is emailed. Exact attachment hashes,
  durable delivery status and stable message IDs are retained. An uncertain
  SMTP outcome is not automatically resent.
- Proof approval is explicit, revision-bound, and persists. A GET cannot approve.
  Refunds, cancellation, changed designs and superseded proofs block the packet.
- Production release is unimplemented and always blocked in this preview.

Use the unpublished private cart's proof link to connect its saved source,
sign in, connect the receiver, simulate shipping and pickup, prepare or upload
a PDF, review it, and send it only to the owner. No order or payment creation
operation is implemented in this directory.

To undo, remove only this endpoint's three app webhook subscriptions, disable
the preview flag, and restore only the unpublished theme asset if needed.
Preserve the original shipping protection and all shipping profiles. Leave the
private data directory intact for review. No storefront rollback is necessary.

The public storefront is not enabled by publishing the private theme: its
existing unpublished-theme guard remains in place.
