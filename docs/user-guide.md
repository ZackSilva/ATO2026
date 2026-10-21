# Use SlabTrak

[Documentation](README.md) · [Local setup](getting-started.md) · [Market data](market-data.md)

## Find your way around

| Page | Use it for |
| --- | --- |
| Home | Collection estimates, coverage and sales-evidence history. |
| My Collection | Search, inspect and manage your physical cards. |
| Reports | Acquisition costs, recorded sales, fees and profit. |
| Discover | Search completed auctions and inspect individual results. |
| Settings | Account, storage, market-data and display information. |

The account menu is in the top-right header. Open it to see the signed-in username or choose **Sign out**. It closes with Escape, an outside click, or when keyboard focus leaves it.

## Add and inspect cards

After signing in, choose **Add card**. In **Find your card**, search by player, year, set or card number, then choose **Search cards**. Review the results and choose **Use card details** to fill the editable identity fields below. Check the issue, number and parallel against your copy; catalog suggestions can be incomplete. Searching or choosing details does not save a card, confirm a market match or supply a price. You can also enter everything manually.

Only the player/subject is required; each saved entry represents one physical card. Enter a second entry for another copy, even if its printed card details match. Matching definitions are shared within your account, while grading, serial numbers, notes, and costs stay separate for each copy.

When the details are ready, choose **Estimate Value** near the top of the editor to save the physical copy first and open the estimate flow. It automatically finds candidate matches when pricing is configured; review the exact issue, parallel and grading label, then choose **Use this match** before automatic pricing begins. **Save card** still saves without pricing and offers **Estimate Value** afterward. A failed or unsupported lookup leaves your saved card available without an invented estimate.

Blank costs mean unknown. Enter `0` for a cost you know was zero. A total acquisition cost appears only when purchase price, shipping, tax, and other costs are all known; otherwise the screen labels the recorded costs as incomplete. These amounts are acquisition records, not market valuations, and different currencies are not combined.

Click a card row, its title, or its thumbnail to open read-only details: identity, grading, photos, acquisition costs, seller, and notes. The title is also a keyboard-accessible button. Choose **Estimate Value** in the details header to find and confirm a market match for an existing card. **Edit** is a separate action in the row and detail view; only the editor contains editable fields and save/archive/delete controls. Saving or canceling an edit opened from details returns to that view. Missing costs remain unknown, distinct from a recorded zero.

## Record grading and sales

To record **PSA 9**, choose **Edit → Condition → Graded**, set **Grading company** to PSA, and enter 9 in **Grade**. With a configured server token and an approved PSA API account, entering a 6–12 digit **Certification number** and leaving the field requests a lookup. **Look up certificate** retries it. Typing alone makes no lookup request.

A successful response proposes details for review. Check the physical card and label, then choose **Use certificate details** to fill identity and grading fields. Nothing is applied automatically; an unknown manufacturer or unsupported year preserves your existing entry, and acquisition costs stay unchanged. Choose **Estimate Value** afterward to save and follow the same explicit catalog-match confirmation. A certificate proposal supplies no price and does not establish ownership or physical authenticity.

The live PSA check returned HTTP 403 because API access requires an approved customer account; no successful live lookup has been demonstrated. Manual entry remains usable. BGS, SGC, CGC and TAG retain manual certificate/grade entry and official verification links; automated lookup is not available for them. BGS records can also store subgrades. See [certificate lookup coverage and setup](certificate-lookups.md).

To record a sale, choose **Edit → Ownership status → Sold**. Enter the gross **Sale price**, total **Sale fees**, and an optional **Sold on** date in the card's currency. Enter 0 when no fees were charged. The editor previews **Net sale = sale price − fees**, **Profit vs purchase price = net sale − purchase price**, and **Profit after all acquisition costs = net sale − purchase price − shipping − tax − other costs**. Unknown purchase costs stay unknown. A negative result is a loss; fees can exceed the sale price. These amounts are computed exactly in cents/decimals and remain separate from market estimates.

Sold cards leave active collection counts and the current estimate cohort. Find them under **Filters → Show → Sold**; their rows and read-only details show recorded sale figures. A sold card cannot also be archived. Choosing **In collection** and saving clears its current sale record; canceling preserves it. This is one editable sale per physical copy, with no sale-event history, refund ledger, automatic fee schedule, currency conversion, or immutable transaction ledger.

## Search and archive

Search finds players/subjects, sets, manufacturers, card numbers, parallels, category, certification, grading company, notes, and seller. Use **Filters → Show → Archive** to find archived cards, then choose **Edit** to restore one. Permanent deletion requires a second confirmation. Records refresh when you return to the browser window; a conflicting edit offers an explicit reload instead of overwriting a newer save.

## Front and back photos

In card details, switch between **Front** and **Back**, then choose **Enlarge photos** for a larger image. **Edit** lets you upload, replace, or remove the selected side's JPEG, PNG, or WebP image (up to 4 MiB and 16 megapixels per side). Save a new card before adding its photos. Photo changes save separately and retain unsaved editor fields until you save or close the editor. Uploaded images are re-encoded as JPEG previews at up to 1,200 pixels on the longest side and 1 MiB per image; metadata is removed. Both previews stay private to their owner. Local previews survive ordinary container replacement in the named `photos` volume. Existing images are retained as fronts; a back-only card uses its back as the thumbnail.

Hosted photos use a private Supabase Storage bucket when the operator configures that backend; see [storage setup](vercel-services.md#private-hosted-photo-storage). View, replace and remove photos through SlabTrak as usual. Settings reports the configured storage backend. Local and hosted photos remain separate, with no automatic transfer. Live hosted persistence after redeployment and two-device verification remain pending.

## Home and value history

Home opens with the current known estimate subtotal, coverage, and a sale-evidence history chart. The chart holds today’s supported unsold-card cohort fixed and recomputes each card’s median from its available matching sales in each historical 180-day window, requiring at least three matches per card. Missing support stays a gap. This describes available evidence for the current cohort, not past holdings, a stored valuation ledger or investment returns; currencies stay separate. Collection mini graphs show actual matching sale dates and prices, with **Not enough sale history** when fewer than two sales are available. There are no fictional runtime values or data-source choices. Purchase costs remain separately labeled and unknown costs stay blank in the editor; sold-card figures use saved amounts. Mini graphs remain visible on phones, **More card details** expands secondary information, and Add card stays beside the My Collection heading.

## Reports and recorded finances

**Reports** shows current collection estimates followed by recorded spending, sales after fees, and profit after complete acquisition costs. **Sales and cost breakdown** expands gross sales, selling fees, cost of cards still owned, and a separate purchase-price-only comparison. The estimate snapshot is independent of the spending period and identifies automatic pricing or saved evidence; recorded finances use your saved transactions. Choose all time, last year, last six months, last three months, last month, or last week, and select one recorded currency at a time. These totals include every saved card, including archived cards, independently of collection filters and pagination. Unknown amounts remain unknown; known subtotals show their coverage and whether they are incomplete. Enter explicit zero for acquisition expenses that did not apply if you want complete-cost profit calculated.

Recorded activity charts show daily spending, sales, fees, proceeds, or profit on their actual transaction dates. Undated records count toward all-time totals but not dated ranges or charts. Future-dated transactions are excluded through today and flagged; date boundaries use UTC. Cost of cards still owned is a current snapshot across all dates, including archived cards, and does not change with the period selector. Reports keeps estimate history and a raw-versus-graded value chart visible alongside recorded finances. Financial activity charts also start expanded on phones and can be collapsed with **Hide financial chart**. Editing, reversing a sale, or deleting a card changes these summaries and their past activity: they summarize current records rather than an immutable transaction ledger.

## Automatic estimates

Choose **Estimate Value** in the editor or the read-only card details header. The editor saves the physical copy before opening pricing; the estimate flow automatically retrieves candidate matches when configured. Review the issue/parallel and grading label, then choose **Use this match**. Catalog search and certificate lookup only prepare editable details; neither confirms this match. Confirm each physical copy separately. Changes to card identity, grade, condition or currency require a new confirmation.

The **View sold comparables** page also offers **Estimate Value → Find exact card**. A card saved with **Save card** can enter the same flow through its post-save **Estimate Value** action. Saving does not require a market-data connection or a supported price.

At least three matching sales within 180 days support an estimate; evidence older than 90 days is flagged. Live pricing supports USD, raw cards with unassessed condition, and exact graded labels. Unsupported identities or conditions remain unknown. Costs, recorded sale proceeds and estimates are separate figures; currencies are not combined. See [market data and coverage](market-data.md) for matching, freshness, provider quotas and retention.

## Reference images and sample history

[The historical collection research](historical-sales-research.md) documents the five-card sample and source-reported sale observations. [The original four-card image manifest](../data/example-cards.json) records issue-reference images, not verified photos or certifications of your physical copies. These files do not automatically seed another installation. Replace reference images with your own photos and record only your known acquisition costs.

The [valuation example](valuation-example.md) distinguishes source-reported sales from independently verified transactions. Historical samples are research fixtures, not a live market feed.
