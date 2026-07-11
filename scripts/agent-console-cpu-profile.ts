export type CpuProfileNode = Readonly<{
  id: number;
  hitCount?: number;
  callFrame: Readonly<{
    functionName: string;
    url: string;
    lineNumber: number;
  }>;
}>;

export type CpuProfile = Readonly<{
  nodes: readonly CpuProfileNode[];
  samples?: readonly number[];
  timeDeltas?: readonly number[];
}>;

export type CpuProfileHotspot = Readonly<{
  functionName: string;
  url: string;
  selfTimeMs: number;
  samples: number;
}>;

export function summarizeCpuProfile(profile: CpuProfile, limit = 20): readonly CpuProfileHotspot[] {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const totals = new Map<
    string,
    { functionName: string; url: string; micros: number; samples: number }
  >();
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  for (let index = 0; index < samples.length; index++) {
    const node = nodes.get(samples[index]!);
    if (!node) continue;
    const functionName = node.callFrame.functionName || "(anonymous)";
    const url = node.callFrame.url || "(native)";
    const key = `${url}\u0000${functionName}`;
    const current = totals.get(key) ?? { functionName, url, micros: 0, samples: 0 };
    current.micros += Math.max(0, deltas[index] ?? 0);
    current.samples++;
    totals.set(key, current);
  }
  return Array.from(totals.values())
    .sort((a, b) => b.micros - a.micros || b.samples - a.samples)
    .slice(0, limit)
    .map((entry) => ({
      functionName: entry.functionName,
      url: entry.url,
      selfTimeMs: entry.micros / 1_000,
      samples: entry.samples,
    }));
}
