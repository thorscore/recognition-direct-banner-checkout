# Public Photo ID orders

Public entry: https://recognition-direct.com/pages/photo-id-badges
Staff queue: https://checkout.recognition-direct.com/photo-id/staff

This module uses the existing live Shopify and SMTP connections. It does not use the PhotoID Dev app, the test-store credentials, or the private pilot database. Customer photos, artwork, orders and proofs belong in the persistent private `data/photo-id-orders.sqlite`, never in Git.

Customers can design and check out as guests without an email code or account. An opaque, HttpOnly guest cookie protects their own uploads and designs for the current browser visit. The order/proof email is collected with contact details at checkout; typing an email never grants account or staff access. Optional email-code sign-in saves the current guest designs for reorders and access on another device. Only the verified `roth@recognition-direct.com` identity has staff access. Prepared proofs stay invisible to customers until staff explicitly reviews and sends them.

The Shopify page contains the designer under the normal storefront header. Its main Design link scrolls to the embedded designer. Opening an old standalone customer designer URL returns to the storefront, preserving its order/proof fragment. Parent/iframe messages validate both the origin and exact source window and accept only an opaque job/proof ID. Payment uses the same normal Shopify checkout as name badges. Customer proof email links point to the storefront; another device verifies the order email to open a private proof. No sign-in is needed to place an order.

Guest identities and verified email identities remain separate. Verified access to a guest order requires its exact order email; discovery lists include paid guest orders only. Optional sign-in transactionally moves only designs owned by the current guest cookie with a matching or unset order email. A failed upgrade retains the guest session and usable code. Guest metadata uses new side tables, preserving the original job/session column layouts and existing signed-in customers.

Checkout creates an unpaid live Shopify draft. Customers choose whether to pay at Shopify. Printing/quantity/attachments/delivery lock once a checkout exists. No automatic payment, invoice email, proof approval, fulfillment or production release occurs. An interrupted create is held for review rather than retried blindly. Real payment verification rejects test transactions, changed amounts/buyers and refunds.

Current prices: front only $12.50, both sides $15.50. Lanyard +$2, magnet +$2.25, reel +$4; pin, strap and no attachment have no surcharge. Shipping/handling is the existing name-badge schedule: $12.95 for 1–49 badges and $19.95 for 50. Native pickup is free at Shopify location 97024180520, 8680 Troy St., Spring Valley, CA 91977. The handle is resolved dynamically. Taxes are calculated by Shopify.

Only staff can prepare/send proofs or retrieve original production files. The customer reviews the emailed PDF and approves or requests changes under the same verified email. Requested changes are visible in the queue. Production PDFs require fresh paid-order verification and approval of the exact current revision. Approved customer designs are locked; Reorder creates an editable copy without carrying over checkout or approval.

Source uploads are kept unchanged automatically. Display previews are small derivatives and reuse the tested preview queue and PDF.js worker. Full-resolution normalized artwork is used for production PDFs; staff can also retrieve the original source. Downloads do not replace the ordering page. SVG/PDF/PDF-compatible AI previews use the hardened existing vector normalizer.

Storage limits: 30 saved orders/designs per customer, 512 MiB of artwork per customer, 2 GiB global artwork and a 256 MiB free-disk reserve. Limits return an explicit contact message; they do not silently remove paid orders or originals. Review actual persistent-disk space before raising limits. No automatic retention deletion is implemented.

Before deployment, run `npm test`, validate the Shopify operations, back up persistent data with the SQLite online backup API, and preserve the exact source manifest and previous Git SHA. Rollback removes the new public page/entry link and restores the previous source commit without deleting private data.
