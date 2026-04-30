# Runtime Abstraction (P2)

Shared UI code in `apps/**` should not directly import or assume:

- `window` / `document`
- `navigator.clipboard`
- `requestAnimationFrame`

Instead, use the runtime helpers exported from `vue-terminal`:

- environment flags (`isBrowser/isTerminal`)
- safe wrappers (`timer`, `raf`, `clipboard`, `getWindow/getDocument`)

## Why

- The same Vue app should run in browser (DOM renderer) and in Node/terminal (stdout renderer + stdin).
- Removing hard browser deps keeps terminal builds deterministic and prevents runtime crashes.

## Guidelines

- DOM-only code (e.g. `createDomRenderer`) may use `document` directly.
- Shared UI code should call runtime wrappers or feature-detect via `isBrowser`.
