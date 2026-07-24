/**
 * Flappy Bird — Terminal Example Runner
 *
 * Run: bun run run:flappy:terminal
 *
 * This example imports from the standalone terminal-flappy-bird package.
 * The actual game logic lives in terminal-flappy-bird/src/.
 * For npm consumers: npx terminal-flappy-bird  (after npm install)
 */
import { runFlappyBird } from "../terminal-flappy-bird/src/index.js";

runFlappyBird();
