export const trendBySignalId = {
  "signal-known-danger-death": "needs-attention",
  "signal-bad-trade-read": "needs-attention",
  "signal-greed-wave-death": "watch",
  "signal-cs-missed-while-present": "watch",
  "signal-clean-disengage": "positive",
  "signal-bad-2v2-death": "positive",
  "signal-bad-pre6-allin": "unknown",
  "signal-late-objective-arrival": "needs-attention",
  "signal-failed-vision-retake": "watch",
  "signal-unclear-fight-trade-give-call": "needs-attention"
};

export function findById(items, id) {
  return items.find((item) => item.id === id) ?? null;
}

export function indexById(items) {
  return new Map(items.map((item) => [item.id, item]));
}

export function normalizeStringArray(values) {
  return Array.isArray(values)
    ? values.map((value) => String(value ?? "").trim()).filter(Boolean)
    : [];
}

export function slug(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function todayIsoDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}
