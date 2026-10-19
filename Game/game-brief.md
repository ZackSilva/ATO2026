# Space Dodger — game brief

Status: first playable version implemented in `index.html`; user playtest pending.

## Concept

A solo player taps or presses Space to keep a spaceship flying through gaps in approaching obstacles, earning one point per obstacle passed.

Audience: workshop participants looking for a quick, approachable browser game. Use the course's simple space theme, geometric artwork, and gentle difficulty as starting defaults.

## First-version rules

- Open on a short instruction screen with a Start button. Nothing moves or scores before Start.
- The ship stays at a fixed horizontal position and falls gently. Each press of Space or activation of a visible Boost button gives one upward impulse. Holding Space does not repeat boosts; touch, mouse, and keyboard activation each produce one boost.
- Obstacles move from right to left with generous gaps. Passing the trailing edge of one obstacle pair awards exactly one point.
- Touching an obstacle or the top or bottom playfield boundary ends the round immediately. Movement and scoring stop, and the final score and Play again button appear.
- Play again immediately starts a fresh round with zero points, the original ship position and velocity, and a fresh obstacle sequence. Repeated replay must not speed up the game.
- Help pauses an active round and preserves its state. Returning from a background tab shows a paused screen with Resume; no hidden time advances the game. Resuming does not also boost the ship.
- There is no fixed winning score or countdown. The goal is to beat your previous round; the first version does not save a best score.

## Controls and appearance

Use standard buttons for Start, Boost, Help, Resume, and Play again, with visible keyboard focus and Tab/Enter support. Space boosts during active play; pressing Space on another focused control must not trigger both actions. Keep score and instructions readable at laptop and phone widths. Begin with a dark space background, a simple ship, and clearly visible obstacles; sound and decorative effects can wait.

## Build plan

1. Build a complete, plain start → fly → collision → result → replay loop in one self-contained `index.html`, with CSS and JavaScript included. It should open directly in a browser without installation.
2. Check scoring, single-input behavior, collision, pause/resume, and repeated replay. Fix failures before visual polish.
3. Improve readability and phone layout, then ask a partner to play without coaching. Repeat the checks on the final version before preparing publication.

Keep movement and difficulty settings together in the code so speed, gravity, boost strength, and gap size can be adjusted one at a time. Use elapsed-time or fixed-step motion so display refresh rate does not set the difficulty. Start testing with repeatable obstacle placement.

## Five completion checks

| Check | Action | Expected result |
| --- | --- | --- |
| Start | Open the file, wait, then activate Start. | Instructions remain idle; Start begins one round with zero points and no accidental boost. |
| Controls | Try one Space press, a held Space key, and the Boost button; repeat on a real phone when available. | Each deliberate activation gives one boost; holding Space does not repeat it; the page does not scroll during play. |
| Score and collision | Pass an obstacle pair, then deliberately hit an obstacle or boundary. | The pair awards one point only; collision freezes the round and displays the exact final score. |
| Replay | End and restart three rounds. | Each starts at zero with fresh ship and obstacle state; speed and input behavior remain consistent. |
| Pause and usability | Open and close Help, switch tabs and return, then inspect narrow layout and keyboard focus. | State is preserved while paused; Resume continues without a time jump or extra boost; controls remain readable and reachable. |

Automated Chrome results are recorded in `game-test-report.md`. User playtesting and real phone touch checks remain pending; a narrow desktop window checks layout only.

## Scope and destination

Working folder: `/Users/zlsilva/Sandbox`. Intended game repository: `https://github.com/ZackSilva/ATO2026.git`. No website project currently exists in this folder; keep any future website in a separate project.

Leave multiplayer, logins, databases, remote leaderboards, saved scores, external assets, sound, multiple levels, and paid services outside this first version. Building files, saving a Git commit, pushing to GitHub, and deploying are separate actions. This planning checkpoint does not publish anything.
