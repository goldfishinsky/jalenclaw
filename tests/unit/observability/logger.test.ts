// tests/unit/observability/logger.test.ts
import { describe, it, expect } from "vitest";
import { PassThrough } from "node:stream";
import { createLogger } from "../../../src/observability/logger.js";

function createTestLogger(opts: { service: string; level?: string }) {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on("data", (chunk: Buffer) => chunks.push(chunk));

  const logger = createLogger({
    service: opts.service,
    level: opts.level,
    _destination: stream,
  });

  function getLines(): Record<string, unknown>[] {
    const raw = Buffer.concat(chunks).toString();
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  }

  return { logger, getLines };
}

describe("createLogger", () => {
  it("creates logger with correct service name", () => {
    const { logger, getLines } = createTestLogger({ service: "core" });
    logger.info("boot");
    const lines = getLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveProperty("name", "core");
  });

  it("logs at info level", () => {
    const { logger, getLines } = createTestLogger({ service: "core" });
    logger.info("server_started");
    const lines = getLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveProperty("level", 30); // pino info = 30
  });

  it("logs at warn level", () => {
    const { logger, getLines } = createTestLogger({ service: "core" });
    logger.warn("high_memory");
    const lines = getLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveProperty("level", 40); // pino warn = 40
  });

  it("logs at error level", () => {
    const { logger, getLines } = createTestLogger({ service: "core" });
    logger.error("crash");
    const lines = getLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveProperty("level", 50); // pino error = 50
  });

  it("logs at debug level when level is debug", () => {
    const { logger, getLines } = createTestLogger({
      service: "core",
      level: "debug",
    });
    logger.debug("trace_info");
    const lines = getLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveProperty("level", 20); // pino debug = 20
  });

  it("includes event field in log output", () => {
    const { logger, getLines } = createTestLogger({ service: "core" });
    logger.info("message_received");
    const lines = getLines();
    expect(lines[0]).toHaveProperty("event", "message_received");
  });

  it("includes extra data fields", () => {
    const { logger, getLines } = createTestLogger({
      service: "channel:whatsapp",
    });
    logger.info("message_received", {
      senderId: "86138xxxx",
      latencyMs: 42,
    });
    const lines = getLines();
    expect(lines[0]).toHaveProperty("event", "message_received");
    expect(lines[0]).toHaveProperty("senderId", "86138xxxx");
    expect(lines[0]).toHaveProperty("latencyMs", 42);
  });

  it("child logger inherits service and adds bindings", () => {
    const { logger, getLines } = createTestLogger({
      service: "channel:whatsapp",
    });
    const child = logger.child({ groupId: "default" });
    child.info("child_event", { extra: true });
    const lines = getLines();
    expect(lines[0]).toHaveProperty("name", "channel:whatsapp");
    expect(lines[0]).toHaveProperty("groupId", "default");
    expect(lines[0]).toHaveProperty("event", "child_event");
    expect(lines[0]).toHaveProperty("extra", true);
  });

  it("setLevel changes the log level at runtime", () => {
    const { logger, getLines } = createTestLogger({ service: "core" });
    // Default level is info, debug should be suppressed
    logger.debug("should_not_appear");
    expect(getLines()).toHaveLength(0);

    logger.setLevel("debug");
    logger.debug("should_appear");
    const lines = getLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveProperty("event", "should_appear");
  });

  it("respects initial log level (debug suppressed at info level)", () => {
    const { logger, getLines } = createTestLogger({ service: "core" });
    logger.debug("hidden");
    logger.info("visible");
    const lines = getLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveProperty("event", "visible");
  });
});
