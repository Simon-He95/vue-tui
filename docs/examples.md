# Examples Index

这些 example 是 release candidate 的行为验收入口。它们按运行环境分组，方便确认 browser DOM renderer、stdout renderer、headless smoke 和 high-throughput log stack 没有互相脱节。

## Browser Examples

| Example       | Command                          | Purpose                                          |
| ------------- | -------------------------------- | ------------------------------------------------ |
| Basic         | `pnpm -C examples/basic dev`     | 基础组件、输入、select、table、browser renderer  |
| Basic build   | `pnpm run build:examples`        | browser example build smoke                      |
| Agent Console | `pnpm run example:agent-console` | streaming transcript、markdown/log、overlay 组合 |

## Terminal Examples

| Example                | Command                                    | Purpose                                     |
| ---------------------- | ------------------------------------------ | ------------------------------------------- |
| Basic terminal         | `pnpm run run:basic:terminal`              | stdout renderer + stdin driver 基础交互     |
| Basic multi-select     | `pnpm run run:basic:multi-select:terminal` | terminal multi-select interaction           |
| TLogView Lab           | `pnpm run run:tlog-view-lab`               | retained log、search、links、minimap 组合   |
| Agent Console terminal | `pnpm run example:agent-console:terminal`  | Agent Console 的真实 terminal/stdout runner |

## Headless Smoke

| Smoke                  | Command                                         | CI Suitability |
| ---------------------- | ----------------------------------------------- | -------------- |
| TLogView Lab           | `pnpm run example:tlog-view-lab`                | yes            |
| Agent Console          | `pnpm run example:agent-console:smoke`          | yes            |
| Agent Console terminal | `pnpm run example:agent-console:terminal:smoke` | yes            |

Smoke 命令应保持 deterministic，不接真实 LLM API，不依赖真实 TTY，也不使用耗时阈值作为 pass/fail gate。

## Related Docs

- [Agent Console 示例](/agent-console)
- [TLogView Lab](/tlog-view-lab)
- [Performance](/performance)
- [0.x Release Candidate](/release-candidate)
