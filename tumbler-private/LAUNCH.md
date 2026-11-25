# Staged 20 oz tumbler launch

Customer ordering is OFF by default. Hosting this code or publishing a theme alone cannot enable it.

Activation requires all of: existing private backend enabled; TUMBLER_20OZ_LAUNCH_ENABLED=true; owner launch control enabled; the 20 oz product assigned to the new template; and that template's enable_customer_checkout setting enabled. No other product is assigned or intercepted. The launch template contains the original ordering form as its fallback. No-JavaScript and disabled/unavailable status use that form.

The initial native cart supports the one 20 oz product and one to four total units, USD, exact original prices, UPS Ground or free native Spring Valley pickup. Other products, larger quantities and mixed carts retain existing ordering. Coupons, edited quantities/prices, cancellation/refunds, changed customer email, invalid source references or unmatched artwork require staff review. Payment/design connection exceptions are visible separately in the private staff queue.

The existing app receiver accepts only marked lines and independently verifies the paid Shopify order, capture total, shipping, variant and saved admission. Customer admission is stamped by the server only while new checkout is enabled. Proof recipient is the authoritative paid-order email, not a form parameter. All original file bytes are preserved.

Staff prepare and review the PDF before sending it. Approval is explicit and bound to exact PDF version/hash. Approved production downloads recheck payment, customer email, source artwork, delivery and proof. No automatic fulfillment or production release operation is provided. Refunds/cancellation revoke readiness. Real customer jobs use a separate database from private and rehearsal jobs.

The owner-only customer rehearsal uses synthetic payment data and sends only to Roth. The public proof page has Recognition Direct branding and customer wording; owner queue controls are never exposed by a proof link.

To pause only this checkout: use Pause new tumbler checkout in the owner preview, or set the NEW launch env flag false. Restore only the 20 oz product's templateSuffix to personalized-drinkware if needed. Leave the private backend, receiver subscriptions and disk intact so already-admitted paid orders can finish proofs. Other rates, pickup, profiles and theme fixes remain unchanged.

Before public activation: owner approval; verify the product template assignment and switch; verify a real paid-order event when separately authorized or on the first real customer order. Simulated event tests must never be described as a completed Shopify order test.
