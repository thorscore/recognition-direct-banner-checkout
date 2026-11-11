# Private Photo ID pilot

Owner-only route: `/photo-id-pilot/`. Not linked from public navigation. All private APIs, images, proof PDFs and artwork PDFs require an emailed owner session. Only `roth@recognition-direct.com` can sign in or receive pilot email. No Express One or customer roles are inherited.

Uses the existing Render persistent `data` directory, a separate SQLite database and the existing `EXPRESS_ONE_SMTP_*` sender. The only additional secret is `PHOTO_ID_PILOT_SHOPIFY_SECRET`, the existing Recognition Direct PhotoID Dev app secret. Never put it in source, URLs or logs. Without it, saved designs and previews work; checkout stays disabled.

The Shopify adapter is fixed to `recognition-direct-id-badge-test.myshopify.com`, app 444573384705, USD and exactly the already-approved draft/order scopes. It does not call the live-store adapter. One successful checkout per printed-side option is allowed in this owner pilot. Use front-only shipping and two-sided Troy Street pickup for the two trials. Mutations with uncertain results are held, never retried automatically. No checkout completion, payment capture, invoicing, fulfillment, label purchase or production-release operation is implemented.

Sequence: save a fictional badge -> create a test-store checkout -> owner completes a Shopify test payment -> check payment -> prepare PDF -> owner reviews and explicitly sends the proof -> open private proof link on phone -> sign in -> approve/request changes -> return to queue -> download artwork after current approval. Payment must be a verified test transaction. Production artwork is rechecked against Shopify and the latest approved revision on every download.

Photos and original raster artwork are stored only in the private database, not the shared public uploads directory. JPEG/PNG/WebP up to 10 MB and 16 million pixels are accepted; orientation is normalized for preview/PDF while originals are retained. Public retention policies are not established by this pilot. Use fictional data only. Asset storage is capped at 128 MiB and 12 pilot jobs.

Proof PDFs include front/back, identity lines, quantity, material, dimensions, thickness, corners, colors, attachment, punch geometry, logo/photo placement and delivery. Artwork PDFs have one actual-trim-size front/back pair per person, not repeated copies; quantities remain on the proof/job sheet. Embedded OFL Carlito fonts; RGB; no bleed; punch guides omitted. Preview uses server-generated PDF geometry. No production guarantee is implied.

Local tests inject mock Shopify/email adapters and never use production secrets. `npm test` covers existing routes plus pilot auth, HTTP privacy, file integrity, duplicate prevention, payment binding, revision/approval gates and PDF generation. A local preview harness is deliberately outside this deployable project. Do not add lab identity selectors or mock-payment bypasses to this route.
