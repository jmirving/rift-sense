import express from "express";

import {
  buildOnboardingGoalDashboardState,
  getTemplateLibrary,
  normalizeGoalDashboard
} from "../goal-dashboard.js";
import { badRequest } from "../errors.js";

const VALID_CONTEXTS = new Set(["personal", "team", "both"]);
const VALID_ROLES = new Set(["Top", "Jungle", "Mid", "ADC", "Support", "Multiple"]);

function defaultHomeRecord(userId) {
  return {
    id: userId,
    profile: {
      displayName: "RiftSense Player",
      teamName: "Local Demo Squad",
      primaryRole: "ADC",
      focusArea: "Onboarding"
    },
    focusBoard: {
      greeting: "Work on one clear improvement target today.",
      todayGoal: {
        title: "Complete onboarding",
        summary: "Choose a template-backed goal and first action.",
        progressLabel: "Ready to start"
      },
      progress: {
        todayPercent: 0,
        weeklyPercent: 0,
        monthlyPercent: 0
      },
      weeklyGoals: [],
      monthlyGoals: [],
      recentGameStats: []
    },
    coachFeed: {
      headline: "No coach recommendations are configured for this user yet.",
      sections: []
    },
    continueLearning: []
  };
}

function validateTemplateIds(body, library) {
  const context = VALID_CONTEXTS.has(body.context) ? body.context : "personal";
  const role = VALID_ROLES.has(body.role) ? body.role : "ADC";
  const shouldCreatePersonal = context === "personal" || context === "both";
  const shouldCreateTeam = context === "team" || context === "both";
  const goalTemplate = library.goalTemplates.find(
    (template) => template.id === body.selectedGoalTemplateId
  );
  const teamFocusTemplate = library.teamFocusTemplates.find(
    (template) => template.id === body.selectedTeamFocusTemplateId
  );
  const actionTemplate = body.selectedActionTemplateId
    ? library.actionTemplates.find((template) => template.id === body.selectedActionTemplateId)
    : null;

  if (shouldCreatePersonal && !goalTemplate) {
    throw badRequest("Select a valid goal template.");
  }

  if (shouldCreateTeam && !teamFocusTemplate) {
    throw badRequest("Select a valid team focus template.");
  }

  if (body.selectedActionTemplateId && !actionTemplate) {
    throw badRequest("Select a valid first action.");
  }

  const signalIds = new Set(library.signalTemplates.map((template) => template.id));
  const selectedSignalIds = Array.isArray(body.selectedSignalIds)
    ? body.selectedSignalIds.map((value) => String(value ?? "").trim()).filter(Boolean)
    : [];

  const invalidSignalId = selectedSignalIds.find((signalId) => !signalIds.has(signalId));
  if (invalidSignalId) {
    throw badRequest(`Unknown signal template: ${invalidSignalId}`);
  }

  const weeklyTargets = Array.isArray(body.weeklyTargets) ? body.weeklyTargets : [];
  weeklyTargets.forEach((target) => {
    if (!target || !signalIds.has(target.signalId)) {
      throw badRequest("Weekly targets must reference valid signal templates.");
    }
    if (!Number.isFinite(Number(target.targetValue))) {
      throw badRequest("Weekly target values must be numeric.");
    }
  });

  return {
    context,
    role,
    selectedSignalIds,
    weeklyTargets: weeklyTargets.map((target) => ({
      signalId: target.signalId,
      targetValue: Number(target.targetValue),
      label: target.label
    }))
  };
}

export function createOnboardingRouter({ config, userHomesRepository }) {
  const router = express.Router();
  const requireAuth = config.requireAuth;

  router.get("/options", (_request, response) => {
    response.json({
      templates: getTemplateLibrary()
    });
  });

  router.post("/", requireAuth, async (request, response) => {
    const library = getTemplateLibrary();
    const validated = validateTemplateIds(request.body ?? {}, library);
    const ownerId = request.identity?.id ?? config.demoUserId;
    const existingHome =
      (await userHomesRepository.getUserHome(ownerId)) ?? defaultHomeRecord(ownerId);
    const teamId = request.body?.teamId ?? `${ownerId}-team`;
    const goalDashboard = buildOnboardingGoalDashboardState({
      ...validated,
      ownerId,
      teamId,
      selectedGoalTemplateId: request.body?.selectedGoalTemplateId,
      selectedActionTemplateId: request.body?.selectedActionTemplateId,
      selectedTeamFocusTemplateId: request.body?.selectedTeamFocusTemplateId
    });
    const saved = await userHomesRepository.saveUserHome({
      ...existingHome,
      id: ownerId,
      profile: {
        ...existingHome.profile,
        primaryRole: validated.role,
        focusArea: "Template-backed onboarding"
      },
      goalDashboard,
      updatedAt: new Date().toISOString()
    });

    response.status(201).json({
      goalDashboard: normalizeGoalDashboard(saved.goalDashboard)
    });
  });

  return router;
}
