export function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function bootstrapMedianCi95(
  values: readonly number[],
  iterations = 2_000,
): readonly [number, number] {
  if (!values.length) return [0, 0];
  let seed = 0x12345678;
  const estimates: number[] = [];
  for (let turn = 0; turn < iterations; turn++) {
    const sample: number[] = [];
    for (let index = 0; index < values.length; index++) {
      seed = (1664525 * seed + 1013904223) >>> 0;
      sample.push(values[seed % values.length]!);
    }
    estimates.push(median(sample));
  }
  estimates.sort((a, b) => a - b);
  return [
    estimates[Math.floor(estimates.length * 0.025)]!,
    estimates[Math.min(estimates.length - 1, Math.floor(estimates.length * 0.975))]!,
  ];
}

export type PairedRun = Readonly<{
  round: number;
  scenario?: string;
  name?: string;
  elapsedMs?: number;
  timing?: Readonly<{ elapsedMs?: number }>;
  profileResult?: Readonly<{ elapsedMs?: number; timing?: Readonly<{ totalElapsedMs?: number }> }>;
}>;

export function workloadElapsedMs(run: PairedRun): number {
  return (
    run.profileResult?.timing?.totalElapsedMs ??
    run.profileResult?.elapsedMs ??
    run.elapsedMs ??
    run.timing?.elapsedMs ??
    0
  );
}

export function pairedRatiosByRound(
  fromRuns: readonly PairedRun[],
  toRuns: readonly PairedRun[],
  scenario: string,
): number[] {
  const select = (runs: readonly PairedRun[]) =>
    new Map(
      runs
        .filter((run) => (run.scenario ?? run.name) === scenario)
        .map((run) => [run.round, workloadElapsedMs(run)]),
    );
  const from = select(fromRuns);
  const to = select(toRuns);
  return [...from.keys()]
    .sort((a, b) => a - b)
    .map((round) => {
      const before = from.get(round);
      const after = to.get(round);
      if (!(before && after)) throw new Error(`${scenario}: missing paired round ${round}`);
      return after / before;
    });
}

export function pairedComparison(
  fromRuns: readonly PairedRun[],
  toRuns: readonly PairedRun[],
  scenario: string,
) {
  const pairedRatios = pairedRatiosByRound(fromRuns, toRuns, scenario);
  return {
    pairedRatios,
    pairedMedianRatio: median(pairedRatios),
    pairedBootstrapCi95: bootstrapMedianCi95(pairedRatios),
  };
}

export type PerformancePolicy = Readonly<{
  maxPairedMedianRatio: number;
  maxBootstrapUpper?: number;
  rejectWhenBootstrapLowerExceeds?: number;
  maxAbsoluteMs?: number;
}>;

export function assertPairedPolicy(
  label: string,
  comparison: Readonly<{
    pairedMedianRatio: number;
    pairedBootstrapCi95: readonly [number, number];
    elapsedMedianToMs?: number;
  }>,
  policy: PerformancePolicy,
): void {
  if (comparison.pairedMedianRatio > policy.maxPairedMedianRatio)
    throw new Error(
      `${label}: paired median ${comparison.pairedMedianRatio} exceeds ${policy.maxPairedMedianRatio}`,
    );
  if (
    policy.maxBootstrapUpper != null &&
    comparison.pairedBootstrapCi95[1] >= policy.maxBootstrapUpper
  )
    throw new Error(`${label}: paired CI upper bound is not below ${policy.maxBootstrapUpper}`);
  if (
    policy.rejectWhenBootstrapLowerExceeds != null &&
    comparison.pairedBootstrapCi95[0] > policy.rejectWhenBootstrapLowerExceeds
  )
    throw new Error(
      `${label}: paired CI clearly exceeds ${policy.rejectWhenBootstrapLowerExceeds}`,
    );
  if (
    policy.maxAbsoluteMs != null &&
    (comparison.elapsedMedianToMs ?? Infinity) > policy.maxAbsoluteMs
  )
    throw new Error(`${label}: elapsed median exceeds ${policy.maxAbsoluteMs}ms`);
}
