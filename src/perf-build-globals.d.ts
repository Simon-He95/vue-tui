/**
 * Compile-time global for performance instrumentation stripping.
 *
 * When building production bundles, this is set to `false` to eliminate
 * all performance instrumentation code paths via dead-code elimination.
 *
 * When running tests or profiling in source mode (tsx, vitest), this
 * remains `true` to preserve internal observability.
 */
declare const __VUE_TUI_PERF_INSTRUMENTATION__: boolean;
