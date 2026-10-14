# Hoops sounds

Put sound files in this folder. The file name (without extension) decides which sound it is.
Supported formats: `.wav`, `.mp3`, `.ogg`, `.m4a`. If a file is missing, nothing plays.

| File name    | When it plays                                    |
| ------------ | ------------------------------------------------ |
| `shoot`      | You release the ball and shoot (exists)          |
| `stretch`    | You start dragging the ball                      |
| `bounce`     | The ball bounces (exists). Also used for wall, board and rim if they have no file of their own. The pitch is randomized every time. |
| `wall`       | The ball bounces off a screen edge               |
| `board`      | The ball hits the backboard                      |
| `rim`        | The ball hits the rim                            |
| `swish`      | Goal! The ball goes through the net (exists)     |
| `swoosh2`    | Goal! Plays together with `swish` (second swoosh layer) |
| `confetti`   | The confetti is fired                            |
| `cheer`      | Goal! (exists: 8-bit power-up, freesound)        |
| `boom`       | Goal! Plays at the same time (8-bit explosion)   |
| `crowd`      | Goal! Crowd cheering (8-bit filtered)            |
| `ignite`     | The ball catches fire (three goals in a row)     |
| `fireball`   | The spoken word "Fireball", a layer on `ignite` |
| `gasp`       | Near miss: the crowd sometimes gasps when the ball hits the rim without going in |
| `milestone`  | Milestone: 25, 50, 100 goals and then every 100  |
| `levelup`    | Milestone: plays together with `milestone` (8-bit level-up) |
| `appear`     | The hoop slides in                               |
| `ui`         | Click in the menu                                |
| `achievement`  | Achievement unlocked: the ping |
| `achievement2` | Achievement unlocked: plays together with `achievement` (the pop) |
| `ignite` | The ball catches fire: the third goal in a row |
| `extinguish` | The fire on the ball goes out (a miss, or the scene hiding) |
