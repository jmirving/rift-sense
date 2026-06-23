import express from "express";

import { normalizeGoalDashboard } from "../goal-dashboard.js";
import { badRequest, notFound } from "../errors.js";

function activeFocus(instance) {
  return instance && !["paused", "detached", "archived", "completed"].includes(instance.status);
}

function syncActiveFocusAlias(goalDashboard) {
  const focusInstances = goalDashboard.focusPlan?.focusInstances ?? [];
  const primary = focusInstances.find((focus) => focus.priority === "primary" && activeFocus(focus)) ??
    focusInstances.find((focus) => focus.status === "active" && activeFocus(focus)) ??
    null;
  goalDashboard.activeGoalInstances = primary ? [{ ...primary, templateId: primary.focusTemplateId ?? primary.templateId }] : [];
}

async function loadHome({ request, config, userHomesRepository }) {
  const ownerId = request.identity?.id ?? config.demoUserId;
  const home = await userHomesRepository.getUserHome(ownerId);
  if (!home?.goalDashboard?.focusPlan) {
    throw notFound("Goal plan not found.");
  }
  return { ownerId, home };
}

export function createGoalPlanRouter({ config, userHomesRepository }) {
  const router = express.Router();
  const requireAuth = config.requireAuth;

  router.patch("/focuses/:focusInstanceId", requireAuth, async (request, response) => {
    const { ownerId, home } = await loadHome({ request, config, userHomesRepository });
    const focuses = home.goalDashboard.focusPlan.focusInstances ?? [];
    const focus = focuses.find((item) => item.id === request.params.focusInstanceId);
    if (!focus) {
      throw notFound("Focus not found.");
    }

    const nextStatus = request.body?.status;
    const nextPriority = request.body?.priority;
    if (nextStatus && !["active", "later", "paused", "detached", "archived"].includes(nextStatus)) {
      throw badRequest("Invalid focus status.");
    }
    if (nextPriority && !["primary", "supporting", "later", "paused"].includes(nextPriority)) {
      throw badRequest("Invalid focus priority.");
    }

    if (nextPriority === "primary") {
      focuses.forEach((item) => {
        if (item.id !== focus.id && item.priority === "primary") {
          item.priority = "supporting";
        }
      });
      focus.status = "active";
    }

    if (nextStatus) {
      focus.status = nextStatus;
      if (nextStatus === "paused") {
        focus.pausedAt = new Date().toISOString();
        focus.priority = focus.priority === "primary" ? "paused" : focus.priority;
      }
      if (nextStatus === "detached" || nextStatus === "archived") {
        focus.detachedAt = new Date().toISOString();
        focus.priority = "detached";
      }
    }
    if (nextPriority && nextStatus !== "detached" && nextStatus !== "archived") {
      focus.priority = nextPriority;
      focus.status = nextPriority === "later" ? "later" : "active";
    }

    syncActiveFocusAlias(home.goalDashboard);
    const saved = await userHomesRepository.saveUserHome({
      ...home,
      id: ownerId,
      updatedAt: new Date().toISOString()
    });
    response.json({ goalDashboard: normalizeGoalDashboard(saved.goalDashboard) });
  });

  router.delete("/focuses/:focusInstanceId", requireAuth, async (request, response) => {
    const { ownerId, home } = await loadHome({ request, config, userHomesRepository });
    const focus = home.goalDashboard.focusPlan.focusInstances?.find((item) => item.id === request.params.focusInstanceId);
    if (!focus) {
      throw notFound("Focus not found.");
    }
    focus.status = "detached";
    focus.priority = "detached";
    focus.detachedAt = new Date().toISOString();
    syncActiveFocusAlias(home.goalDashboard);
    const saved = await userHomesRepository.saveUserHome({
      ...home,
      id: ownerId,
      updatedAt: new Date().toISOString()
    });
    response.json({ goalDashboard: normalizeGoalDashboard(saved.goalDashboard) });
  });

  router.delete("/", requireAuth, async (request, response) => {
    const { ownerId, home } = await loadHome({ request, config, userHomesRepository });
    home.goalDashboard.focusPlan.goalInstance.status = "archived";
    home.goalDashboard.focusPlan.goalInstance.archivedAt = new Date().toISOString();
    home.goalDashboard.focusPlan.focusInstances = (home.goalDashboard.focusPlan.focusInstances ?? []).map((focus) => ({
      ...focus,
      status: focus.status === "detached" ? "detached" : "archived",
      archivedAt: focus.archivedAt ?? new Date().toISOString()
    }));
    home.goalDashboard.activeGoalInstances = [];
    const saved = await userHomesRepository.saveUserHome({
      ...home,
      id: ownerId,
      updatedAt: new Date().toISOString()
    });
    response.json({ goalDashboard: normalizeGoalDashboard(saved.goalDashboard) });
  });

  return router;
}
