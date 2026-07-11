/**
 * No-op instrumentation stub for production builds
 *
 * This module provides empty implementations of all instrumentation
 * functions to enable complete tree-shaking in production.
 */

// Empty no-op functions
const noop = () => {};
const noopWithArg = (_arg: any) => {};
const noopWithArgs = (..._args: any[]) => {};

export const cellInstr = {
  recordCreateCellCall: noop,
  recordCharCellWidthCall: noop,
  recordCacheHit: noopWithArg,
  recordCacheMiss: noopWithArg,
  recordNewCell: noop,
  recordBlankCacheHit: noop,
  recordBlankCacheMiss: noop,
  recordContinuationCacheHit: noop,
  recordContinuationCacheMiss: noop,
  recordCacheClear: noopWithArg,
  registerCacheBucket: noopWithArgs,
  updateMaxCacheSize: noopWithArgs,
};

export const textInstr = {
  recordTextCellWidthCall: noopWithArgs,
  recordRenderPassCacheHit: noop,
  recordRenderPassCacheMiss: noop,
  recordTextWidthCacheHit: noop,
  recordTextWidthCacheMiss: noop,
  recordTextWidthCacheSet: noop,
  recordTextWidthCacheEvict: noop,
  recordWrapByCellsCall: noop,
  recordWrapCacheHit: noop,
  recordWrapCacheMiss: noop,
  recordWrapCacheClear: noop,
  recordWrapCacheSet: noop,
  recordWrapWidthBucketMapClear: noop,
};

export const graphemeInstr = {
  recordSegmentedGraphemesCall: noop,
  recordSegmentationRequiredInput: noop,
  recordIntlSegmenterUsed: noop,
  recordFallbackSegmenterUsed: noop,
};

export const isInstrumentationEnabled = () => false;
export const enableInstrumentation = noop;
export const disableInstrumentation = noop;
export const resetInstrumentation = noop;
export const getInstrumentationMetrics = () => ({} as any);
