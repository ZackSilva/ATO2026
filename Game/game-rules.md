# Space Dodger — rules for version 1

Goal: fly through as many gaps as you can. Every fully passed obstacle pair earns one point. There is no time limit or fixed winning score.

1. Choose Start flight. The ship begins halfway down the playfield with zero vertical speed and zero points.
2. Press Space or activate Boost to rise; the ship falls between boosts. Holding Space does not repeat. On a keyboard, Tab reaches the buttons and Enter activates them.
3. Stay inside the playfield and between the amber edges of each barrier. Touching a barrier or the top or bottom boundary ends the flight immediately.
4. Read the final score and choose Play again for a fresh round.

| State | What happens | Allowed transition |
| --- | --- | --- |
| Instructions | Ship and score remain still. | Start flight resets and begins play; its activation does not boost. |
| Playing | Gravity moves the ship down; boosts push it up; barriers approach. Each pair scores once after its trailing edge passes the whole ship. | Collision ends play; Pause / Help or leaving the window pauses play. |
| Paused | Ship, barriers, and score stay unchanged; instructions appear. | Resume flight continues the same round without an extra boost or elapsed-time jump. |
| Result | Movement and scoring stop; final score appears. | Play again resets and immediately starts a fresh round. |

Replay clears the score, ship position and velocity, obstacles, scoring flags, obstacle sequence, and physics timing. There is one animation loop for the page. Obstacle positions repeat between rounds to make checks reproducible. Nothing is saved between sessions.

The first version uses one self-contained `index.html`. Scores and gameplay are visual; this version does not offer a nonvisual alternative to the animated playfield. A real phone check and a first-time player test remain necessary.
