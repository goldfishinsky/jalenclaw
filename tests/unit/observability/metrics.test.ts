// tests/unit/observability/metrics.test.ts
import { describe, it, expect } from "vitest";
import { createMetricsRegistry } from "../../../src/observability/metrics.js";

describe("MetricsRegistry", () => {
  describe("Counter", () => {
    it("increments correctly", () => {
      const registry = createMetricsRegistry();
      const counter = registry.counter("jalenclaw_llm_tokens_total", "Total LLM tokens consumed");

      counter.inc();
      expect(counter.get()).toBe(1);

      counter.inc(10);
      expect(counter.get()).toBe(11);
    });

    it("tracks separate label sets independently", () => {
      const registry = createMetricsRegistry();
      const counter = registry.counter("jalenclaw_llm_tokens_total", "Total LLM tokens consumed");

      counter.inc(100, { provider: "claude" });
      counter.inc(50, { provider: "openai" });
      counter.inc(25, { provider: "claude" });

      expect(counter.get({ provider: "claude" })).toBe(125);
      expect(counter.get({ provider: "openai" })).toBe(50);
      // No labels returns 0 (separate bucket)
      expect(counter.get()).toBe(0);
    });

    it("rejects negative increments", () => {
      const registry = createMetricsRegistry();
      const counter = registry.counter("test_counter", "test");

      expect(() => counter.inc(-1)).toThrow("Counter can only be incremented");
    });
  });

  describe("Gauge", () => {
    it("supports set, inc, and dec", () => {
      const registry = createMetricsRegistry();
      const gauge = registry.gauge("jalenclaw_memory_bytes", "Process memory usage");

      gauge.set(1024);
      expect(gauge.get()).toBe(1024);

      gauge.inc(256);
      expect(gauge.get()).toBe(1280);

      gauge.dec(128);
      expect(gauge.get()).toBe(1152);
    });

    it("tracks separate label sets independently", () => {
      const registry = createMetricsRegistry();
      const gauge = registry.gauge("jalenclaw_channel_connected", "Channel connection status");

      gauge.set(1, { channel: "telegram" });
      gauge.set(0, { channel: "discord" });

      expect(gauge.get({ channel: "telegram" })).toBe(1);
      expect(gauge.get({ channel: "discord" })).toBe(0);
      expect(gauge.get({ channel: "slack" })).toBe(0);
    });
  });

  describe("Histogram", () => {
    it("observes values and distributes into buckets", () => {
      const registry = createMetricsRegistry();
      const histogram = registry.histogram(
        "jalenclaw_message_latency_ms",
        "Message processing latency",
        [10, 50, 100, 500],
      );

      histogram.observe(5);   // le=10
      histogram.observe(25);  // le=50
      histogram.observe(75);  // le=100
      histogram.observe(200); // le=500
      histogram.observe(800); // > 500, only in +Inf

      const text = histogram.serialize();

      expect(text).toContain('jalenclaw_message_latency_ms_bucket{le="10"} 1');
      expect(text).toContain('jalenclaw_message_latency_ms_bucket{le="50"} 2');
      expect(text).toContain('jalenclaw_message_latency_ms_bucket{le="100"} 3');
      expect(text).toContain('jalenclaw_message_latency_ms_bucket{le="500"} 4');
      expect(text).toContain('jalenclaw_message_latency_ms_bucket{le="+Inf"} 5');
      expect(text).toContain("jalenclaw_message_latency_ms_sum 1105");
      expect(text).toContain("jalenclaw_message_latency_ms_count 5");
    });

    it("uses default buckets when none provided", () => {
      const registry = createMetricsRegistry();
      const histogram = registry.histogram(
        "jalenclaw_message_latency_ms",
        "Message processing latency",
      );

      histogram.observe(42);
      const text = histogram.serialize();

      // Default buckets: 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000
      expect(text).toContain('le="5"');
      expect(text).toContain('le="10"');
      expect(text).toContain('le="25"');
      expect(text).toContain('le="50"');
      expect(text).toContain('le="100"');
      expect(text).toContain('le="250"');
      expect(text).toContain('le="500"');
      expect(text).toContain('le="1000"');
      expect(text).toContain('le="2500"');
      expect(text).toContain('le="5000"');
      expect(text).toContain('le="10000"');
      expect(text).toContain('le="+Inf"');
    });
  });

  describe("serialize", () => {
    it("produces valid Prometheus text format", () => {
      const registry = createMetricsRegistry();
      const counter = registry.counter("jalenclaw_llm_tokens_total", "Total LLM tokens consumed");
      counter.inc(15234, { provider: "claude" });

      const text = registry.serialize();

      expect(text).toContain("# HELP jalenclaw_llm_tokens_total Total LLM tokens consumed");
      expect(text).toContain("# TYPE jalenclaw_llm_tokens_total counter");
      expect(text).toContain('jalenclaw_llm_tokens_total{provider="claude"} 15234');
    });

    it("serializes multiple metrics together", () => {
      const registry = createMetricsRegistry();

      const tokens = registry.counter("jalenclaw_llm_tokens_total", "Total LLM tokens consumed");
      tokens.inc(500, { provider: "claude" });

      const memory = registry.gauge("jalenclaw_memory_bytes", "Process memory usage");
      memory.set(30_000_000);

      const containers = registry.gauge("jalenclaw_agent_containers", "Active agent container count");
      containers.set(3);

      const connected = registry.gauge("jalenclaw_channel_connected", "Channel connection status");
      connected.set(1, { channel: "telegram" });
      connected.set(1, { channel: "discord" });

      const latency = registry.histogram(
        "jalenclaw_message_latency_ms",
        "Message processing latency",
        [50, 100, 500],
      );
      latency.observe(42);
      latency.observe(150);

      const text = registry.serialize();

      // All five metric families present
      expect(text).toContain("# TYPE jalenclaw_llm_tokens_total counter");
      expect(text).toContain("# TYPE jalenclaw_memory_bytes gauge");
      expect(text).toContain("# TYPE jalenclaw_agent_containers gauge");
      expect(text).toContain("# TYPE jalenclaw_channel_connected gauge");
      expect(text).toContain("# TYPE jalenclaw_message_latency_ms histogram");

      // Sections separated by blank lines
      const sections = text.trim().split("\n\n");
      expect(sections.length).toBe(5);
    });

    it("omits metrics with no data points", () => {
      const registry = createMetricsRegistry();
      registry.counter("unused_counter", "Not used");
      registry.gauge("unused_gauge", "Not used");

      const used = registry.counter("used_counter", "Used");
      used.inc(1);

      const text = registry.serialize();

      expect(text).not.toContain("unused_counter");
      expect(text).not.toContain("unused_gauge");
      expect(text).toContain("used_counter");
    });
  });
});
