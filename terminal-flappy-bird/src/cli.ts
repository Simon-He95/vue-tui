#!/usr/bin/env node
/**
 * terminal-flappy-bird — 🐦 Flappy Bird in your terminal
 *
 * Usage:  terminal-flappy-bird   (or npx terminal-flappy-bird)
 * Flap:   Space / ↑ / W
 * Restart: R
 * Quit:   Q / Ctrl-C
 *
 * Requires a graphics-protocol terminal: Kitty, iTerm2, WezTerm, Ghostty, or Sixel.
 * If the terminal is unsupported, a friendly message is printed and the game exits.
 */
import { runFlappyBird } from "./run.js";

runFlappyBird();
