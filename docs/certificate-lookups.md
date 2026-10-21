# Certificate lookups

SlabTrak proposes editable card details from an official provider response. Review them against the physical card and slab label before applying them to the form. Applying a proposal does not save a card; the existing Save action remains necessary. Lookups do not attach catalog identities, establish ownership or physical authenticity, or provide prices.

## Provider coverage

Reviewed October 21, 2026:

| Grader | Automated lookup | Official manual verification |
| --- | --- | --- |
| PSA | Implemented; requires a server token and approved API account access | [PSA certificate verification](https://www.psacard.com/cert/) |
| BGS | Unsupported in this increment | [Beckett's homepage certificate form](https://www.beckett.com/) |
| SGC | Unsupported in this increment | [SGC certificate lookup](https://www.gosgc.com/cert-code-lookup) |
| CGC | Unsupported in this increment | [CGC certificate verification](https://www.cgccards.com/certlookup/) |
| TAG | Unsupported in this increment | [TAG certificate search](https://taggrading.com/pages/cert-search) |

The reviewed official sites for BGS, SGC, CGC and TAG did not provide a documented public integration contract suitable for this adapter. This is a research limitation, not a claim that partnership APIs cannot exist. Their website forms do not authorize an automated integration. SlabTrak does not scrape these sites, call undocumented endpoints, or substitute a third-party lookup. BGS subgrades remain manually editable; no automated source is claimed for them.

## PSA configuration and mapping

Obtain API access through the [PSA public API account page](https://www.psacard.com/publicapi), review its agreement, and set `PSA_API_TOKEN` in the API server's private environment. Restart the API after changing it. Never enter a token in a card field, frontend environment variable, repository, or screenshot. An expired or inaccessible token requires operator attention; SlabTrak does not log in or refresh it.

Live verification on October 21, 2026 reached PSA but returned HTTP 403 with a structured message restricting API access to approved customers. This is an account access blocker; updating the token alone did not enable lookup. No successful live certificate lookup was demonstrated. The operator must obtain PSA Public API approval before automated lookup can be used. The adapter remains ready for an approved account, and manual entry remains available.

The [official authentication documentation](https://www.psacard.com/publicapi/documentation) specifies HTTPS, bearer authorization, and `GET /publicapi/cert/GetByCertNumber/{certNumber}`. Its older response examples include validity/message flags; errors and no-data results must not become proposals.

The current [official Swagger schema](https://api.psacard.com/publicapi/swagger.json), linked by [PSA's method explorer](https://api.psacard.com/publicapi/swagger), names `PSACert.Subject`, not `CardName`. Its response model omits those older flags. The adapter accepts a matching structured record without them, but rejects contradictory flags/messages when present.

| Documented field | Proposed field |
| --- | --- |
| `Subject` | Subject |
| `Year` | Year, only for a supported single four-digit year |
| `Category` | Sport, only for the recognized basketball/football labels below |
| `Brand` | Set name; review this mapping |
| `CardNumber` | Card number |
| `Variety` | Parallel; review this mapping |
| `CardGrade` | Grade |
| `CertNumber` | Certification, only when it exactly matches the request |

The schema documents `Category` as a string rather than a fixed enumeration. Exact labels `BASKETBALL CARDS` and `FOOTBALL CARDS` map to Basketball and Football, respectively, as corroborated by public official records for [basketball](https://www.psacard.com/cert/01216611/psa) and [football](https://www.psacard.com/cert/28138668/psa). Comparison ignores case and surrounding spaces; every other category stays blank. Manufacturer is unknown. Season ranges remain unset. Grade description and item status appear in the review notice when supplied. Autograph, memorabilia/relic, serial number, print run, images and financial values are not inferred. A `DNACert` response alone cannot populate a card. A returned record does not guarantee that a physical holder or certificate remains valid; check the official record and label.

## API behavior

- `GET /api/certificates/status` requires a session and returns each grader's `supported`, `configured`, and official `verification_url` values. Configured means a token is present, not that its access has been verified.
- `POST /api/certificates/lookup` requires a session, trusted origin and CSRF header. Send `{ "grader": "PSA", "certification": "00000001" }` (synthetic example).
- A normal response includes `state` (`found`, `not_found`, or `unavailable`), `grader`, `certification`, `draft`, `verification_url`, and `notice`. Only `found` contains a draft. Unsupported graders and unconfigured PSA return a manual fallback.
- Invalid inputs return 422. Provider rejection, malformed/mismatched records and server failures return sanitized 502 errors; transport failures return 503; provider rate limits return 429. Provider 401 reports a rejected token; provider 403 explains that an approved PSA API account is required. Raw upstream messages and credentials are never returned.

Requests use a fixed HTTPS host, reject redirects, time out after ten seconds, and read at most 64 KiB plus an overflow sentinel. The certificate travels in the server-to-PSA URL; avoid logging outbound request URLs or headers in deployment instrumentation. The application route uses POST so its access-log URL contains no certificate.

Tests use synthetic documented-schema fixtures and mocked transport. They cover authentication, CSRF/origin enforcement, no database writes, fallback, mismatches, malformed data, bounded transport and sanitized failures. They do not demonstrate live account access or certify any real card.
