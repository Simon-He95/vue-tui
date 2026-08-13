# Markdown Graphics Benchmark: 2026-08-13 Darwin arm64 Node 24.16.0

This is a non-release local before/after sample for the Markdown graphics optimization. Both revisions ran the same `scripts/bench-markdown-graphics.ts` workload on the same machine.

| Field     | Value                                                       |
| --------- | ----------------------------------------------------------- |
| Date      | 2026-08-13                                                  |
| Baseline  | `origin/main` at `bd678c6d2f905ca67de6b9a8e4d72ab95cd6399d` |
| Candidate | This PR working tree                                        |
| Package   | `@simon_he/vue-tui@1.1.5`                                   |
| Host      | macOS 14.5 / Darwin 23.5.0 arm64                            |
| Node      | `v24.16.0`                                                  |
| pnpm      | `10.34.5`                                                   |
| Command   | `pnpm run bench:markdown-graphics`                          |

## Results

| Scenario                                         | `origin/main` |      This PR |                                Change |
| ------------------------------------------------ | ------------: | -----------: | ------------------------------------: |
| 1 MiB image hot paint, 100 iterations            |  `732.373 ms` |   `1.500 ms` |                       `488.2x` faster |
| 256 KiB Kitty image move, 100 moves              |  `810.515 ms` | `126.773 ms` |                         `6.4x` faster |
| Kitty move stdout bytes                          |  `13,362,925` |    `465,884` |                         `96.5%` fewer |
| Kitty image transmissions                        |          `50` |          `1` |                         `98.0%` fewer |
| Kitty placement operations                       |          `50` |         `99` | placement-only after initial transmit |
| Kitty delete operations                          |          `99` |          `0` |             no clear/retransmit cycle |
| `TVirtualMarkdown` dirty rows for one-row scroll |           `6` |          `1` |                         `83.3%` fewer |

Timing values are medians across five samples. They are suitable for this same-machine comparison, not as portable timing budgets. The raw comparison artifact is [2026-08-13-markdown-graphics-darwin-arm64-node24.16.0.json](./2026-08-13-markdown-graphics-darwin-arm64-node24.16.0.json).
