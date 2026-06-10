import { performance } from "node:perf_hooks";

function normalizeIdentifier(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function durationSince(startedAt) {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}

function requestMetadata(request) {
  return {
    requestId: normalizeIdentifier(request?.id) ??
      normalizeIdentifier(request?.headers?.["x-request-id"]) ??
      normalizeIdentifier(request?.headers?.["x-correlation-id"]) ??
      null,
    userId: normalizeIdentifier(request?.identity?.id) ?? null
  };
}

export function startTimer() {
  const startedAt = performance.now();
  return {
    elapsedMs() {
      return durationSince(startedAt);
    }
  };
}

export function logTiming({
  route,
  action,
  step,
  durationMs,
  outcome = "success",
  requestId,
  userId,
  ...metadata
}) {
  const entry = {
    event: "perf_timing",
    route,
    action,
    step,
    durationMs,
    outcome
  };

  for (const [key, value] of Object.entries({ requestId, userId, ...metadata })) {
    if (value !== undefined && value !== null && value !== "") {
      entry[key] = value;
    }
  }

  console.info(JSON.stringify(entry));
}

export function createTimingContext({ route, action, request, logger = logTiming }) {
  const base = {
    route,
    action,
    ...requestMetadata(request)
  };

  return {
    startTimer,
    log(step, outcome, metadata = {}) {
      logger({
        ...base,
        ...metadata,
        step,
        outcome,
        durationMs: metadata.durationMs ?? 0
      });
    },
    async time(step, fn, metadata = {}) {
      const timer = startTimer();
      try {
        const result = await fn();
        logger({
          ...base,
          ...metadata,
          step,
          durationMs: timer.elapsedMs(),
          outcome: "success"
        });
        return result;
      } catch (error) {
        logger({
          ...base,
          ...metadata,
          step,
          durationMs: timer.elapsedMs(),
          outcome: "failure",
          errorName: error?.name ?? "Error"
        });
        throw error;
      }
    }
  };
}
