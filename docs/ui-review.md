# Fresh-context UI review

Reviewed October 19, 2026. An independent sub-agent started without the conversation or prior requirements. It inspected the desktop, tablet, and phone screenshots, then read limited frontend code to check interactions. These are design judgments and observed implementation choices, not user-testing results or an accessibility audit. The screenshots predate the header account-menu change.

The reviewer found the visual style calm and consistent, with strong card names, useful desktop comparison columns, consistent dividers, native filters, and clear signed value changes. Its main concern was hierarchy: the opening screen emphasizes portfolio figures more than the collection itself.

| Priority | Observation | Recommended improvement |
| --- | --- | --- |
| 1 | On the supplied phone screenshot, Add card is roughly 1,020px down and the first card roughly 1,490px down. | Expose the collection action earlier and reduce introductory/chart height on phones. Retain the requested top chart, but consider a compact default presentation with expansion. |
| 2 | Exact dollar figures are prominent while the explanation that both values and purchases are fictional is small and spatially separate. | Put a concise demo designation beside the financial headline. Make the distinction between demo purchase price and recorded cost understandable without opening an editor. |
| 3 | Each phone row takes roughly 330px, with financial details and a separate edit action extending well below its small image. | Keep identity, condition, and a primary value visible; consider expanding secondary prices and trends on demand. Preserve the useful desktop column alignment. |
| 4 | Several interpretive labels and tags are 9–11px. | Increase meaningful supporting text and shorten repeated explanations to recover space. Small text alone does not establish a WCAG failure; measured contrast and assistive-technology checks are separate. |
| 5 | The overview period also controls row sparklines, but its controls are far above the rows on phones; the mobile chart hides its exploration hint. | Identify the shared trend period near the collection and add a short touch-exploration cue. Keep the current period visible beside each trend. |
| 6 | Reference photos show graded slabs while stored examples are raw; understanding the distinction requires reading the reference explanation. The edit action uses an external-link arrow although it opens a dialog. | Make reference-photo status clearer near card identity and offer a clear path to adding the owner's photo. Replace the external-destination cue on the editor action. |

The review also supported placing sign-out in a header account dropdown. That specific change is implemented; the other findings remain recommendations for discussion. The existing preferences for true black, the text wordmark, the graded-slab icon, rows, and a configurable top chart remain the design direction. Prioritize reducing mobile effort and improving clarity before adding more visual decoration.
