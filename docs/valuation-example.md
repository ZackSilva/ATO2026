# Researched valuation example

This page retains the earlier four-card research checkpoint. The current five-card sample and replacement football issues are in [Historical sales research](historical-sales-research.md); its individual observations and remaining coverage gaps supersede this older sample.

Checked October 20, 2026. This is a small, manually researched example of the existing estimator, not a live market feed or an appraisal. The source file contains public market observations, not a saved user collection. It never supplies purchase prices, ownership claims, certifications, or photos.

## Evidence and expected results

Each graded estimate is the median of three reported eBay sales for the exact issue and PSA grade. The source reports were inspected; original eBay pages were unavailable or returned stale active-auction snapshots, so completed transaction facts are **reported, not independently verified**. Rows with ambiguous Best Offer asking/accepted prices were excluded, as were auction-house totals that include buyer premiums. Amounts are copied as reported, without manual shipping/tax adjustments or seller-fee deductions. The [PriceCharting/SportsCardsPro methodology](https://www.pricecharting.com/page/methodology) describes item prices excluding shipping and transaction costs. The PSA-reported Jordan rows' transaction-component basis could not be independently verified. A handful of selected observations is not complete market coverage.

| Card | Grade | Reported sales (USD) | Expected median (USD) |
| --- | --- | --- | --- |
| 1986 Fleer Michael Jordan #57 | PSA 9 | Oct 9: 42,200.00; Jul 27: 45,500.00; Jul 6: 42,850.00 | 42,850.00 |
| 1986 Fleer Charles Barkley #7 | PSA 8 | Oct 16: 542.79; Oct 14: 620.00; Oct 9: 485.10 | 542.79 |
| 2000 Bowman Tom Brady #236 (base, not Chrome) | PSA 9 | Oct 9: 5,122.00; Sep 29: 5,656.54; Aug 31: 6,701.00 | 5,656.54 |
| 1989 Score Barry Sanders #257 | PSA 10 | Oct 10: 2,399.99; Sep 22: 2,247.00; Sep 14: 2,100.00 | 2,247.00 |

For those four grades the known estimate subtotal is USD 51,296.33, with low confidence and an observed sale range for each. These results apply to the recorded grades; the existing example grades are illustrative, and the source photos do not verify the owner's physical copies. No acquisition cost or gain can be inferred from an estimate. Unknown purchase costs remain unknown.

The Barkley evidence also includes three separately classified raw sales: October 18 USD 140.00, October 16 USD 120.00, and October 14 USD 167.50. Their raw median is USD 140.00, with low confidence and unverified physical condition. They remain context for the PSA 8 copy and cannot change its median. The browser demonstration creates a temporary raw copy only in the isolated test database; importing the file never adds a physical copy or changes an existing grade.

Every observation retains its individual eBay item URL and dated source label in [the research file](../data/researched-sales-2026-10-20.json). Provenance:

- Jordan: [PSA CardFacts auction table](https://www.psacard.com/cardfacts/basketball-cards/1986-fleer/michael-jordan-57/5003) for the July rows, and [PSA similar sales](https://www.psacard.com/cert/44869044/psa) for October. The July table was available through indexed search results; direct retrieval exceeded the research tool's page limit.
- Barkley: [SportsCardsPro reported sold listings](https://www.sportscardspro.com/game/basketball-cards-1986-fleer/charles-barkley-7), inspecting the title's exact grader and grade rather than treating the site's combined Grade 8 bucket as PSA-only. Raw records exclude entries explicitly described as graded.
- Brady: [SportsCardsPro reported sold listings](https://www.sportscardspro.com/game/football-cards-2000-bowman/tom-brady-236), with October/September rows also reported in [PSA similar sales](https://www.psacard.com/cert/06584208/psa). SportsCardsPro reports the August sale on August 31; the indexed eBay.ca page displayed August 30 at 20:00 EDT, corresponding to August 31 UTC. The file preserves the source's August 31 date.
- Sanders: [SportsCardsPro PSA 10 reported sold listings](https://www.sportscardspro.com/game/football-cards-1989-panini-score/barry-sanders-257). No autograph or other-grade rows enter the example.

## Add evidence to an existing local collection

The operator importer reads a manually prepared JSON file and makes no network requests. It requires an explicit account, exact immutable card identities with existing physical copies, valid sale/research URLs, and actual dates within the current 180-day window. It preflights the entire file, rejects conflicting reused sale URLs, and appends only missing observations in one transaction. Repeating an unchanged file does not increase the sample count. It cannot create accounts/cards or change acquisition costs, photos, notes, or grades.

Retain a private database backup first, using the README instructions. Rebuild the API after updating source. Replace `collector` with the account used on this installation, then review the dry-run:

```sh
docker compose build api
docker compose up -d api
docker compose exec -T api python -m slabtrak.evidence_import --username collector --file - < data/researched-sales-2026-10-20.json
```

Append the reviewed evidence:

```sh
docker compose exec -T api python -m slabtrak.evidence_import --username collector --file - --apply < data/researched-sales-2026-10-20.json
```

The importer refuses stale observations rather than moving their dates forward. The estimator also naturally ages out saved observations; refresh the evidence when fewer than three matches remain. Other private comparable sales already recorded for a card can change its calculated median from the example above. Imported rows can be individually removed from the card's Sold comparables page.

Open **Home** to review the current known estimate subtotal and coverage. Its history chart uses today’s supported unsold cards as a fixed cohort and recalculates each card’s median from the matching sales available in each historical 180-day window, requiring three sales per card. Unsupported dates remain gaps; this is not past ownership or an investment-return chart. Keep the currency selection consistent with the evidence.

Open **My Collection** (`/collection`) to see the saved-card estimates and actual comparable-sale mini graphs. The graphs plot individual recorded sale dates and prices; fewer than two sales shows **Not enough sale history**. There is no data-source or fictional-value mode. Open a card’s details and follow **View and manage sold comparables** to inspect the dated observations and source links. Purchase-cost fields remain blank when unknown; neither an estimate nor a sale-price change supplies an acquisition cost or personal gain.

To append the final historical pack, first add its five exact issues/grades to the intended sample collection, then use the owner-scoped importer with `--include-history`. This opt-in accepts older observations for graphs while leaving the current-estimate 180-day rule intact:

```sh
docker compose exec -T api python -m slabtrak.evidence_import --username collector --file - --include-history < data/historical-collection-2026-10-20.json
```

Review the dry-run before adding `--apply`. The importer never creates or replaces card copies; the local reference-only sample replacement was separately backed up and explicitly authorized. Do not import these observations into differently numbered issues.
