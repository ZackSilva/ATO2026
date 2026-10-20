# SlabTrak design system v1

SlabTrak is a quiet workspace for a personal trading-card collection. Make the collection easy to read, keep controls familiar, and use space before adding containers.

## Decisions and review status

The chosen direction is pure pitch-black dark mode (`#000000`), minimal modern typography, and open layouts. Summary metrics below “Welcome” sit directly on the canvas without individual boxes. Preserve the existing lowercase `slabtrak.` text wordmark: Arial, bold `slab`, regular `trak`, tight tracking, and a pale-mint dot. Pair it with a clean graded-slab icon with a small top label.

The exact token values, slab geometry, component dimensions, and responsive breakpoints below are the v1 proposal for visual review. The live `/design` page and application share these tokens and brand components. Executed checks and their limits are recorded in [validation](validation.md); this proposal remains open to visual feedback.

## Color and semantic roles

Use semantic CSS tokens from `apps/web/app/tokens.css` rather than introducing colors in individual components. Role names below describe intent; keep their implementation names consistent with that file.

| Role | Proposed value | Use |
| --- | --- | --- |
| Canvas | `#000000` | Page background, including the collection workspace |
| Subtle surface | `#0a0a0a` | Subtle grouped content |
| Raised surface | `#111111` | Row hover and controls that need separation |
| Main ink | `#f5f5f3` | Headings, body text, key values |
| Muted ink | `#a3a3a0` | Supporting text and field help |
| Quiet ink | `#767674` | Low-emphasis metadata, subject to contrast verification |
| Line | `#262626` | Separators between meaningful groups |
| Strong border | `#616161` | Visible input and secondary-action boundaries |
| Accent | `#c6e5b1` | Primary actions, brand dot, selected emphasis |
| Primary-action ink | `#10150d` | Text and icons on the mint button |
| Accent hover | `#daf0cc` | Primary-action hover |
| Focus | `#e5c17a` | Visible keyboard focus ring |

Reserve separate semantic roles for success, warning, and error. Success may use a restrained green, warning an amber, and error a warm red; verify final foreground/background pairs before treating them as approved. Mint is the brand accent, not a universal status indicator. Every state also needs text or an icon with an accessible name, so color never carries the meaning alone.

Use the line token for decoration. Use the stronger border where identifying a control depends on seeing its boundary. Avoid gradients, tinted page backgrounds, large shadows, and decorative borders around every section.

## Brand geometry

- Keep the wordmark as text. Explicitly retain Arial for it even when the application font changes. Keep the dot mint and immediately after `trak`; prevent the lockup from wrapping.
- The icon is one upright graded slab: a rounded outer case, a narrow label near the top, and a larger card window below. Keep the outline and internal strokes consistent. Avoid stacked sheets or document-like text lines.
- Use compact corner curves and a clear gap between label and window. Fine label details must remain readable as geometry at header size; omit miniature lettering.
- Align the icon optically with the wordmark and leave clear space around the lockup. Scale the icon proportionally; never stretch it.
- A decorative icon beside the text wordmark is hidden from assistive technology. Give the enclosing home link one accessible name. A standalone brand link needs its own accessible name.

Use the shared brand implementation at `apps/web/components/brand.tsx` rather than copying SVGs or rebuilding the wordmark on each page.

## Typography and hierarchy

Use the bundled, self-hosted Geist font with Arial, Helvetica, and sans-serif fallbacks. Its license and provenance are retained beside the asset in `apps/web/app/fonts/`. The wordmark always retains Arial. Use a small number of weights: regular for reading, medium for headings and values, and semibold for controls. Avoid thin text on black.

| Element | Starting size | Guidance |
| --- | --- | --- |
| Workspace page heading | 32px desktop / 26px phone | One primary heading per page; compact tracking |
| Section heading | 22–24px | Clear hierarchy below the page heading |
| Metric value | 36px desktop / 32px phone | Regular weight; tabular numbers |
| Body and controls | 14–16px | Comfortable line height, usually 1.5–1.6 |
| Supporting text | 12–14px | Muted ink; avoid hiding essential facts here |
| Metadata | 12px starting point | Optional system monospace for identifiers |

The sign-in introduction may use a larger display heading. Keep collection data more compact. Use tabular numerals for counts, prices, grades, and pagination so columns remain stable. Reserve uppercase and tracking for short labels; long labels and instructions use sentence case. Allow long player names, set names, and identifiers to wrap.

## Spacing and shape

Use a 4px base with a small scale: `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`. Typical pairings are 8px between a label and control, 16px between related controls, 24px between content groups, and 32–48px between major sections.

Use 4px radii for small details, 8px for controls and image frames, and 12px for dialogs. Avoid large pill shapes except where the content calls for one. Let content and alignment establish hierarchy before adding a surface or border.

## Layout and components

### Workspace and metrics

Keep a centered, bounded content width with generous desktop gutters and approximately 20px phone gutters. “Welcome”, the summary, and the collection belong to the same open canvas. Present cards, graded cards, and raw cards as three compact metrics beneath the value chart. Do not show the purchase-price-unknown count in this overview. Use spacing and aligned baselines; no individual metric backgrounds, outlines, or shadows. A separator is useful only when it marks a real section boundary.

### Collection rows and images

Cards always appear in a row list, with the photo on the left. On desktop, place condition alongside identity and align the trend, current value, purchase price, and row action into stable columns. On phones, stack those details beside or below the identity while keeping the photo left and labels understandable without desktop column headings.

Render photographs with `object-fit: contain`; show the complete card and slab rather than cropping their edges. Use a calm neutral frame and a clear missing-side placeholder. Reference images must carry a visible “Reference” label in the row and a clear explanation in preview. Keep that label readable at the final thumbnail size. Never imply that a reference image is the owner’s actual card or proves its condition.

Use subtle separators between rows and restrained hover emphasis. Clicking a row, title, or thumbnail opens read-only details; the title remains a native keyboard-accessible button. Keep a separate “Edit” action in both row and detail view. Inline financial disclosures retain their own behavior. Details use labeled text and definition lists, with no editable fields or mutation controls. Image enlargement remains available within details; upload/removal belongs in the editor. Preserve the originating row focus when the detail view closes, and return from editing or image enlargement to the same detail view.

### Controls and forms

Use mint for the main action, such as “Add card” or “Save card”. Secondary actions use neutral ink and a visible border; destructive actions use the error role and precise wording. Prefer one clear primary action within a group.

Give every input a persistent label. Placeholder text supplies an example, not the field name. Group related editor fields with legends and keep explanatory text near the field it explains. Use native controls where practical, with consistent heights and visible focus. Keep labels and help legible when fields are disabled.

### Dialogs

Use native modal dialogs with a clear title, an accessible close button, bounded height, and internal scrolling when needed. Keep save and cancel actions easy to find. On close, restore focus to the opener, or a sensible collection heading if the opener was removed. Preserve the full card image in preview and keep its caption visible. Deletion needs a distinct confirmation explaining permanence.

## Data language and states

Display stored facts plainly. “Acquisition cost” means recorded purchase costs; do not call it market value, portfolio value, profit, or return. Distinguish a complete total from “Recorded costs · incomplete”. Show “Unknown” for missing costs and an em dash for a summary still loading; neither means zero. Demo financial values are explicitly enabled at the user's request for design review. Label the chart and row financials as demo values in USD. Compute them only for display, never write them into saved purchases or describe them as sourced market estimates. Keep actual recorded acquisition costs separately labeled and available in the editor. Collection counts and card identities remain stored facts.

| State | Required presentation |
| --- | --- |
| Default | Clear label, readable content, visible action affordance |
| Hover | Subtle surface or border change; no layout shift |
| Focus | Visible focus ring independent of hover |
| Disabled | Explain availability where needed; preserve label readability |
| Pending | Use a specific verb such as “Saving…”; prevent duplicate submission and expose busy status |
| Error | Explain the failed action and a useful recovery step; retain entered values where possible |
| Empty | Distinguish a new collection from no search matches; offer the relevant next action |
| Offline / unavailable | Explain the connection problem, label retained records as last loaded, and provide retry; do not imply a successful save |
| Conflict | Explain that the record changed elsewhere and offer an explicit reload/review path; do not silently overwrite |

Keep progress and success messages near the affected action. Use polite status announcements for routine updates and alerts for actionable failures. Avoid exposing implementation details in user-facing messages unless they help recovery.

## Accessibility and responsive behavior

- Verify normal text contrast of at least 4.5:1, large text at least 3:1, and essential control boundaries and indicators at least 3:1 against adjacent colors. Check actual combinations, including hover, focus, disabled, and status surfaces.
- Keep focus visible and unobscured. Support keyboard access to every action, modal Escape handling, and focus restoration. Use semantic headings, labels, buttons, lists, and dialog names.
- Aim for interactive targets of at least 44 × 44px. Increase the clickable area around small icons and checkbox labels without enlarging the visual artwork unnecessarily.
- At narrow widths and browser zoom, wrap toolbars and names, stack form fields, and keep actions reachable. Do not force horizontal page scrolling or remove information to make the layout fit.
- Respect reduced-motion preferences. Keep transitions short and functional; avoid entrance motion and animated counters.

## Implementation map and review

| Location | Responsibility |
| --- | --- |
| `apps/web/app/tokens.css` | Shared semantic colors, spacing, type, and shape tokens |
| `apps/web/app/globals.css` | Global defaults and component/layout styling using those tokens |
| `apps/web/components/brand.tsx` | Shared slab icon and preserved text wordmark |
| `apps/web/app/page.tsx` | Sign-in and authenticated workspace shell |
| `apps/web/app/collection.tsx` | Real collection metrics, row list, filters, and actions |
| `apps/web/app/design/` | Live `/design` showcase for reviewing tokens, components, and representative states |

These files are the implemented ownership boundaries. Keep the showcase free of live data mutations and label demonstrations clearly.

For ongoing visual review, check the sign-in page, an empty collection, a populated collection, the editor, image preview, and the showcase at desktop and phone widths. Confirm the true-black canvas, unchanged wordmark typography, recognizable slab label, unboxed metrics, uncropped images, and honest cost labels. Exercise keyboard navigation, focus restoration, zoom, reduced motion, and connection/error/conflict states. Record what was actually checked separately from checks that remain pending.

## Value exploration prototype

The workspace starts with an unboxed value chart. Its metric selector switches between collection value, unrealized gain/loss, and purchase total; time controls select all time, last year, six months, three months, month, or week. All time currently means two years of simulated history for the same current active cards, not historical holdings or acquisition activity. The purchase baseline is intentionally constant across simulated dates. A fixed active-card set keeps totals independent of row filters, sorting, pagination, or archived-row browsing. Card mutations and window refocus refresh the overview.

Rows show a small value trend for the selected period, current demo value, difference from demo purchase, and demo purchase price. Stored acquisition cost appears separately when known. Use mint for positive movement and warm red for negative movement, always paired with signed numbers. On narrow screens, keep the image beside the identity and wrap the financial detail beneath it. Never force the row into a horizontally scrolling table.

Expose dates, values, range selection, and changes through text and semantic controls. The main plot supports pointer/touch inspection and keyboard arrows/Home/End. Keep focus visible; chart axes and hover values should remain legible. The prototype does not source market data or claim that a reference photo establishes condition or grade.

## Account navigation

Keep account actions in the header's top-right dropdown, separate from the collection welcome, graph, and primary card actions. The trigger uses an initial, the username on wide screens, and a disclosure chevron. On phones the username is available inside the dropdown; do not squeeze or wrap the brand lockup. Show the actual signed-in username and the working sign-out action. Do not add placeholder account settings.

Use native disclosure semantics. Enter/Space opens the account control, Tab reaches its action, Escape closes it and returns focus to its trigger, and outside clicks or focus departure dismiss it. Display pending sign-out state and preserve a retry after failure. Bound the dropdown to the phone viewport and wrap long usernames inside it.

## Compact mobile collection and photo sides

Add card belongs beside the welcome heading so it remains immediately reachable. On phones, the overview starts with its value summary and a Show value chart disclosure; expand it for the graph, touch inspection, and range buttons. The demo designation sits beside the metric heading. A Card trend period selector near the collection keeps the shared overview/row range understandable without scrolling back up.

Mobile rows show identity, condition, demo current value, and Edit first. Clicking the row opens the read-only card view. More card details reveals the trend, demo purchase, and gain/loss inline. Keep meaningful explanations at 12px where possible and retain signed values and keyboard-visible focus. Desktop retains the comparison columns. The editor action opens a dialog and therefore carries no external-link arrow.

Show Reference photo beside identities that use sourced images; pictured grading does not verify the stored physical copy. Front and Back are independent, explicitly selected photo controls in editor and preview. Both sides use uncropped images, clear missing-side states, privacy, and the same revision checks. A back-only card remains previewable from its row.

### Grading and recorded sales

Show the user's grading company and grade together, such as PSA 9, in both held and sold rows. Reference photos do not establish grading; illustrative grades on local demo entries must be explained in their notes.

Keep ownership and grading independent. Sold cards use a Sold badge and a separate filter, leave the active portfolio, and display recorded sale figures instead of demo trends. The editor collects gross price, total fees, and optional date in the card's recorded currency. Preview net sale, profit versus purchase price, and profit after complete acquisition costs with explicit formulas. Unknown amounts never become zero; negative results remain visible as losses. Read-only details retain static sale fields. Returning a card to collection must explain that saving clears its current sale record.
