// src/observability/logger.ts
import pino from "pino";
import type { DestinationStream } from "pino";

export interface LoggerOptions {
  service: string;
  level?: string;
  pretty?: boolean;
  /** @internal Test-only: custom destination stream */
  _destination?: DestinationStream;
}

export interface Logger {
  debug(event: string, data?: Record<string, unknown>): void;
  info(event: string, data?: Record<string, unknown>): void;
  warn(event: string, data?: Record<string, unknown>): void;
  error(event: string, data?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
  setLevel(level: string): void;
}

function wrapPino(instance: pino.Logger): Logger {
  function log(
    level: "debug" | "info" | "warn" | "error",
    event: string,
    data?: Record<string, unknown>,
  ): void {
    instance[level]({ event, ...data });
  }

  return {
    debug: (event, data) => log("debug", event, data),
    info: (event, data) => log("info", event, data),
    warn: (event, data) => log("warn", event, data),
    error: (event, data) => log("error", event, data),
    child(bindings) {
      return wrapPino(instance.child(bindings));
    },
    setLevel(level) {
      instance.level = level;
    },
  };
}

export function createLogger(options: LoggerOptions): Logger {
  const pinoOptions: pino.LoggerOptions = {
    name: options.service,
    level: options.level ?? "info",
  };

  if (options.pretty && !options._destination) {
    pinoOptions.transport = {
      target: "pino-pretty",
    };
  }

  const instance = options._destination
    ? pino(pinoOptions, options._destination)
    : pino(pinoOptions);

  return wrapPino(instance);
}
