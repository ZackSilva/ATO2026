# Space Dodger — version 1 checks

Checked October 19, 2026, on an ARM Mac using headless Google Chrome. Tested the local HTML; no deployment exists. Version 1 identifies `index.html` with SHA-256 `9e888cba38f6e261d9f80889af3caacba256b59824244c5daf24dce798da84a1`.

The temporary browser harness exercised the actual page script and DOM, using controlled physics steps and simulated events. The harness and its injected controls are outside the repository. Separate Chrome DevTools checks opened the unchanged application, sent native browser keyboard events, and captured its layouts at exact 1280 × 1000 and 390 × 844 viewport sizes. These automated checks do not establish how a new player experiences the difficulty or whether a real phone works.

| Check | Status | Observation |
| --- | --- | --- |
| Instructions idle | Passed | Advancing time before Start did not change ship, obstacles, or score. |
| Start | Passed | Start enabled play with zero score, centered ship, and zero velocity. Native Space activation caused no extra boost. |
| Boost and held Space | Passed | Button activation and Space set upward velocity; a repeated keydown was ignored. Native Space on Boost also worked. |
| Focused Help and Resume | Passed | Native Space on Help paused without boosting; Space on Resume preserved the existing velocity. |
| Score once | Passed | Moving one pair fully past the ship awarded one point; later steps did not award it again. |
| Obstacle collision | Passed | An overlapping barrier ended play and froze movement and scoring; Play again appeared. |
| Top and bottom boundaries | Passed | Each boundary ended play when deliberately reached. |
| Pause and help | Passed | Help preserved ship, obstacles, and score. Resume preserved the round and cleared elapsed-time accumulation. |
| Window departure and long delay | Passed | A simulated blur event and a five-second frame gap each paused without moving the round forward. |
| Three replays | Passed | Ship, velocity, obstacles, scoring flags, sequence, and score reset; no new animation loop was scheduled. |
| Display rates | Passed | Simulated 30, 60, and 120 Hz frame schedules produced ship positions within one fixed physics step. |
| Reachable gaps | Passed | A controlled boost strategy cleared ten obstacle pairs using the normal scoring and collision code. |
| Desktop and narrow layouts | Passed | Inspected screenshots at exact 1280px and 390px widths. Instructions and controls fit; document width matched viewport width. |
| Actual tab switching and prolonged interactive play | Not tested | Window-departure logic was exercised automatically; repeat with a real browser session. |
| Real phone touch controls | Not tested | A narrow desktop viewport does not establish physical device behavior. |
| New-player difficulty and understanding | Not tested | Needs an uncoached player. |
| Safari and other browsers | Not tested | Checks above used Chrome. |
| Published game | Not tested | No deployment attempted. |

## Next manual check

Open `index.html` in your browser. Start, boost through a gap, deliberately hit a barrier, and choose Play again. Try three rounds. During one round, open Help or switch tabs; return and resume. Ask a partner to play for two minutes without coaching and record whether the gaps and boost strength feel fair.

Known limitation: the animated flight is visual and has no nonvisual gameplay alternative. Mobile artwork scales to the taller display; difficulty and touch usability still need a real phone playtest.
