# Public Photo ID orders

Public entry: https://recognition-direct.com/pages/photo-id-badges
Staff queue: https://checkout.recognition-direct.com/photo-id/staff

This module uses the existing live Shopify and SMTP connections. It does not use the PhotoID Dev app, the test-store credentials, or the private pilot database. Customer photos, artwork, orders and proofs belong in the persistent private `data/photo-id-orders.sqlite`, never in Git.

An email code verifies each customer before private designs are saved or reopened; no Shopify account or password is required. Only the verified `roth@recognition-direct.com` identity has staff access. Customer documents and uploaded assets are scoped to a server-derived email identity. Prepared proofs are invisible to customers until staff explicitly reviews and sends them.

Checkout creates an unpaid live Shopify draft. Customers choose whether to pay at Shopify. Printing/quantity/attachments/delivery lock once a checkout exists. No automatic payment, invoice email, proof approval, fulfillment or production release occurs. An interrupted create is held for review rather than retried blindly. Real payment verification rejects test transactions, changed amounts/buyers and refunds.

Current prices: front only $12.50, both sides $15.50. Lanyard +$2, magnet +$2.25, reel +$4; pin, strap and no attachment have no surcharge. Shipping/handling is the existing name-badge schedule: $12.95 for 1–49 badges and $19.95 for 50. Native pickup is free at Shopify location 97024180520, 8680 Troy St., Spring Valley, CA 91977. The handle is resolved dynamically. Taxes are calculated by Shopify.

Only staff can prepare/send proofs or retrieve original production files. The customer reviews the emailed PDF and approves or requests changes under the same verified email. Requested changes are visible in the queue. Production PDFs require fresh paid-order verification and approval of the exact current revision. Approved customer designs are locked; Reorder creates an editable copy without carrying over checkout or approval.

Source uploads are kept unchanged automatically. Display previews are small derivatives and reuse the tested preview queue and PDF.js worker. Full-resolution normalized artwork is used for production PDFs; staff can also retrieve the original source. Downloads do not replace the ordering page. SVG/PDF/PDF-compatible AI previews use the hardened existing vector normalizer.

Storage limits: 30 saved orders/designs per customer, 512 MiB of artwork per customer, 2 GiB global artwork and a 256 MiB free-disk reserve. Limits return an explicit contact message; they do not silently remove paid orders or originals. Review actual persistent-disk space before raising limits. No automatic retention deletion is implemented.

Before deployment, run `npm test`, validate the Shopify operations, back up persistent data with the SQLite online backup API, and preserve the exact source manifest and previous Git SHA. Rollback removes the new public page/entry link and restores the previous source commit without deleting private data.
