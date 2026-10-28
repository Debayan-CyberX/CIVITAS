import { METRIC_DEFINITIONS, MetricSampleSchema } from '@civitas/contracts';
import type { MetricRow, MetricSample } from '@civitas/contracts';
export function packMetrics(samples: MetricSample[]): MetricRow[] {
  return samples.map((s) => [
    s.metricId,
    s.scope,
    s.asOfTick,
    s.windowStartTick,
    s.sampleCount,
    s.denominator,
    s.value,
    s.statistic,
    s.qualityFlags,
  ]);
}
export function unpackMetrics(rows: MetricRow[], runId: string): MetricSample[] {
  return rows.map((r) => {
    const def = METRIC_DEFINITIONS.find((d) => d.id === r[0]);
    return MetricSampleSchema.parse({
      runId,
      metricId: r[0],
      scope: r[1],
      asOfTick: r[2],
      windowStartTick: r[3],
      windowEndTick: r[2],
      sampleCount: r[4],
      denominator: r[5],
      value: r[6],
      statistic: r[7],
      qualityFlags: r[8],
      definitionVersion: def?.version,
      unit: def?.unit,
    });
  });
}
