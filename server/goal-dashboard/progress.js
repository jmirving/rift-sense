import { findById, indexById } from "./shared.js";
import { templateLibrary } from "./templates.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function parseLocalDate(value) {
  if (!value) {
    return null;
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfLocalWeek(date) {
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const weekStart = startOfLocalDay(date);
  weekStart.setDate(weekStart.getDate() + mondayOffset);
  return weekStart;
}

function daysBetween(start, end) {
  return Math.max(0, Math.floor((startOfLocalDay(end) - startOfLocalDay(start)) / DAY_MS));
}

function monthLabel(date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function ageLabel(prefix, date, now) {
  const daysActive = daysBetween(date, now);
  if (daysActive === 0) {
    return `${prefix} today`;
  }
  return `${prefix} for ${daysActive} ${daysActive === 1 ? "day" : "days"}`;
}

function valueFromEvent(event) {
  const value = Number(event?.value ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function gameCount(events) {
  const ids = new Set(
    events
      .map((event) => event.matchId ?? event.gameId ?? event.reviewedGameId)
      .filter(Boolean)
  );
  return ids.size;
}

function pluralize(label, count) {
  const normalized = String(label ?? "matching moment").replace(/^0\s+/, "").toLowerCase();
  if (count === 1) {
    return normalized;
  }
  if (normalized.endsWith("death")) {
    return `${normalized.slice(0, -5)}deaths`;
  }
  if (normalized.endsWith("y")) {
    return `${normalized.slice(0, -1)}ies`;
  }
  if (normalized.endsWith("s")) {
    return normalized;
  }
  return `${normalized}s`;
}

function windowSummary({ label, events, signalLabel, target = null, daysElapsed = null, daysRemaining = null }) {
  const matchingMoments = events.reduce((sum, event) => sum + valueFromEvent(event), 0);
  const gamesReviewed = gameCount(events);
  const noun = pluralize(signalLabel, matchingMoments);
  const hasData = events.length > 0 || matchingMoments > 0;
  const status = !hasData
    ? "no-data"
    : target?.targetValue === undefined || target?.targetValue === null
      ? "tracking"
      : matchingMoments <= Number(target.targetValue)
        ? "on-track"
        : daysElapsed !== null && daysElapsed <= 2
          ? "off-track-early"
          : "off-track";

  return {
    label,
    gamesReviewed,
    matchingMoments,
    target: target?.targetValue ?? null,
    daysElapsed,
    daysRemaining,
    valueLabel: hasData ? `${matchingMoments} ${noun}` : "No data yet",
    status
  };
}

export function buildGoalProgress(state = {}, { now = new Date() } = {}) {
  const goalInstance =
    state.focusPlan?.focusInstances?.find((instance) => instance.priority === "primary") ??
    state.activeGoalInstances?.[0] ??
    null;
  if (!goalInstance) {
    return null;
  }

  const signalIndex = indexById(templateLibrary.signalTemplates);
  const goalTemplate =
    findById(templateLibrary.focusTemplates ?? [], goalInstance.focusTemplateId ?? goalInstance.templateId) ??
    (templateLibrary.focusTemplates ?? []).find((template) => template.legacyGoalTemplateIds?.includes(goalInstance.templateId)) ??
    findById(templateLibrary.goalTemplates, goalInstance.templateId);
  const target = goalInstance.weeklyTargets?.[0] ?? goalTemplate?.suggestedWeeklyTargets?.[0] ?? null;
  const focusSignalId = target?.signalId ?? goalInstance.selectedSignalIds?.[0] ?? goalTemplate?.defaultSignalIds?.[0] ?? null;
  const focusSignal = signalIndex.get(focusSignalId);
  const goalStartedAt = parseLocalDate(goalInstance.activeGoalStartedAt ?? goalInstance.goalStartedAt ?? goalInstance.activeSince ?? goalInstance.createdAt ?? goalInstance.selectedAt ?? goalInstance.updatedAt);
  const focusSelectedAt = parseLocalDate(target?.selectedAt ?? goalInstance.focusSelectedAt ?? goalInstance.selectedFocusAt);
  const current = parseLocalDate(now) ?? new Date();
  const todayStart = startOfLocalDay(current);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const weekStart = startOfLocalWeek(current);
  const nextWeekStart = new Date(weekStart);
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);
  const sourceEvents = (state.evidenceEvents ?? []).filter((event) =>
    event?.goalInstanceId === goalInstance.id && event.signalId === focusSignalId
  );
  const sinceFocusStart = focusSelectedAt
    ? sourceEvents.filter((event) => {
        const createdAt = parseLocalDate(event.createdAt);
        return createdAt && createdAt >= focusSelectedAt && createdAt <= current;
      })
    : [];
  const todayEvents = sinceFocusStart.filter((event) => {
    const createdAt = parseLocalDate(event.createdAt);
    return createdAt && createdAt >= todayStart && createdAt < tomorrowStart;
  });
  const weekEvents = sinceFocusStart.filter((event) => {
    const createdAt = parseLocalDate(event.createdAt);
    return createdAt && createdAt >= weekStart && createdAt < nextWeekStart;
  });

  return {
    metricLabel: focusSignal?.label ?? target?.label ?? "Matching moments",
    goalAge: goalStartedAt
      ? {
          startedAt: goalStartedAt.toISOString(),
          daysActive: daysBetween(goalStartedAt, current),
          label: ageLabel("Active", goalStartedAt, current),
          startedLabel: `Started ${monthLabel(goalStartedAt)}`
        }
      : null,
    focusAge: focusSelectedAt
      ? {
          selectedAt: focusSelectedAt.toISOString(),
          daysActive: daysBetween(focusSelectedAt, current),
          label: ageLabel("Selected", focusSelectedAt, current),
          selectedLabel: `selected ${monthLabel(focusSelectedAt)}`
        }
      : null,
    windows: {
      today: windowSummary({ label: "Today", events: todayEvents, signalLabel: focusSignal?.label ?? target?.label }),
      weekToDate: windowSummary({
        label: "This week",
        events: weekEvents,
        signalLabel: focusSignal?.label ?? target?.label,
        target,
        daysElapsed: daysBetween(weekStart, current) + 1,
        daysRemaining: Math.max(0, Math.ceil((nextWeekStart - tomorrowStart) / DAY_MS))
      }),
      sinceFocusStarted: windowSummary({
        label: "Since focus started",
        events: sinceFocusStart,
        signalLabel: focusSignal?.label ?? target?.label
      })
    }
  };
}
