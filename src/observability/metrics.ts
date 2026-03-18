// src/observability/metrics.ts

export interface Counter {
  inc(value?: number, labels?: Record<string, string>): void;
  get(labels?: Record<string, string>): number;
}

export interface Gauge {
  set(value: number, labels?: Record<string, string>): void;
  inc(value?: number, labels?: Record<string, string>): void;
  dec(value?: number, labels?: Record<string, string>): void;
  get(labels?: Record<string, string>): number;
}

export interface Histogram {
  observe(value: number, labels?: Record<string, string>): void;
  serialize(): string;
}

export interface MetricsRegistry {
  counter(name: string, help: string): Counter;
  gauge(name: string, help: string): Gauge;
  histogram(name: string, help: string, buckets?: number[]): Histogram;
  serialize(): string;
}

const DEFAULT_HISTOGRAM_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

function labelsKey(labels?: Record<string, string>): string {
  if (!labels || Object.keys(labels).length === 0) return "";
  const sorted = Object.keys(labels).sort();
  return sorted.map((k) => `${k}="${labels[k]}"`).join(",");
}

function formatLabels(key: string): string {
  return key ? `{${key}}` : "";
}

function createCounter(name: string, help: string): Counter & { _name: string; _help: string; _values: Map<string, number> } {
  const values = new Map<string, number>();

  return {
    _name: name,
    _help: help,
    _values: values,

    inc(value = 1, labels?: Record<string, string>): void {
      if (value < 0) throw new Error("Counter can only be incremented");
      const key = labelsKey(labels);
      values.set(key, (values.get(key) ?? 0) + value);
    },

    get(labels?: Record<string, string>): number {
      return values.get(labelsKey(labels)) ?? 0;
    },
  };
}

function createGauge(name: string, help: string): Gauge & { _name: string; _help: string; _values: Map<string, number> } {
  const values = new Map<string, number>();

  return {
    _name: name,
    _help: help,
    _values: values,

    set(value: number, labels?: Record<string, string>): void {
      values.set(labelsKey(labels), value);
    },

    inc(value = 1, labels?: Record<string, string>): void {
      const key = labelsKey(labels);
      values.set(key, (values.get(key) ?? 0) + value);
    },

    dec(value = 1, labels?: Record<string, string>): void {
      const key = labelsKey(labels);
      values.set(key, (values.get(key) ?? 0) - value);
    },

    get(labels?: Record<string, string>): number {
      return values.get(labelsKey(labels)) ?? 0;
    },
  };
}

interface HistogramInternal extends Histogram {
  _name: string;
  _help: string;
}

function createHistogram(name: string, help: string, buckets: number[]): HistogramInternal {
  const sorted = [...buckets].sort((a, b) => a - b);

  // Per label-set storage: { labelsKey -> { bucketCounts, sum, count } }
  const data = new Map<string, { bucketCounts: number[]; sum: number; count: number }>();

  function ensureData(key: string) {
    if (!data.has(key)) {
      data.set(key, {
        bucketCounts: new Array(sorted.length).fill(0) as number[],
        sum: 0,
        count: 0,
      });
    }
    return data.get(key)!;
  }

  return {
    _name: name,
    _help: help,

    observe(value: number, labels?: Record<string, string>): void {
      const key = labelsKey(labels);
      const d = ensureData(key);
      d.sum += value;
      d.count += 1;
      for (let i = 0; i < sorted.length; i++) {
        if (value <= sorted[i]) {
          d.bucketCounts[i]++;
          break;
        }
      }
    },

    serialize(): string {
      const lines: string[] = [];
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} histogram`);

      for (const [key, d] of data) {
        const lblSuffix = key ? `,${key}` : "";
        let cumulative = 0;
        for (let i = 0; i < sorted.length; i++) {
          cumulative += d.bucketCounts[i];
          lines.push(`${name}_bucket{le="${sorted[i]}"${lblSuffix}} ${cumulative}`);
        }
        lines.push(`${name}_bucket{le="+Inf"${lblSuffix}} ${d.count}`);
        lines.push(`${name}_sum${formatLabels(key)} ${d.sum}`);
        lines.push(`${name}_count${formatLabels(key)} ${d.count}`);
      }

      return lines.join("\n");
    },
  };
}

type InternalCounter = ReturnType<typeof createCounter>;
type InternalGauge = ReturnType<typeof createGauge>;

function serializeCounter(c: InternalCounter): string {
  const lines: string[] = [];
  lines.push(`# HELP ${c._name} ${c._help}`);
  lines.push(`# TYPE ${c._name} counter`);
  for (const [key, value] of c._values) {
    lines.push(`${c._name}${formatLabels(key)} ${value}`);
  }
  return lines.join("\n");
}

function serializeGauge(g: InternalGauge): string {
  const lines: string[] = [];
  lines.push(`# HELP ${g._name} ${g._help}`);
  lines.push(`# TYPE ${g._name} gauge`);
  for (const [key, value] of g._values) {
    lines.push(`${g._name}${formatLabels(key)} ${value}`);
  }
  return lines.join("\n");
}

export function createMetricsRegistry(): MetricsRegistry {
  const counters: InternalCounter[] = [];
  const gauges: InternalGauge[] = [];
  const histograms: HistogramInternal[] = [];

  return {
    counter(name: string, help: string): Counter {
      const c = createCounter(name, help);
      counters.push(c);
      return c;
    },

    gauge(name: string, help: string): Gauge {
      const g = createGauge(name, help);
      gauges.push(g);
      return g;
    },

    histogram(name: string, help: string, buckets?: number[]): Histogram {
      const h = createHistogram(name, help, buckets ?? DEFAULT_HISTOGRAM_BUCKETS);
      histograms.push(h);
      return h;
    },

    serialize(): string {
      const sections: string[] = [];

      for (const c of counters) {
        if (c._values.size > 0) sections.push(serializeCounter(c));
      }
      for (const g of gauges) {
        if (g._values.size > 0) sections.push(serializeGauge(g));
      }
      for (const h of histograms) {
        const s = h.serialize();
        // Only include if there's data beyond the header lines
        if (s.split("\n").length > 2) sections.push(s);
      }

      return sections.join("\n\n") + "\n";
    },
  };
}
