import express from "express";

import {
  buildOnboardingGoalDashboardState,
  getTemplateLibrary,
  normalizeGoalDashboard
} from "../goal-dashboard.js";
import { getSystemGoalTypes } from "../goal-types/system-goal-types.js";
import { badRequest } from "../errors.js";

const VALID_CONTEXTS = new Set(["personal", "team", "both"]);
const VALID_ROLES = new Set(["Top", "Jungle", "Mid", "ADC", "Support", "Multiple"]);

function normalizeNonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function defaultHomeRecord(userId, identity) {
  return {
    id: userId,
    profile: {
      displayName: normalizeNonEmptyString(identity?.displayName) ?? "Player",
      teamName: null,
      primaryRole: null,
      focusArea: null
    }
  };
}

function resolveSelectedFocusArea({ context, library, selectedGoalTemplateId, primaryFocusTemplateId, selectedTeamFocusTemplateId }) {
  if (context === "team") {
    return (
      library.teamFocusTemplates.find((template) => template.id === selectedTeamFocusTemplateId)?.title ??
      null
    );
  }

  return (
    library.focusTemplates.find((template) => template.id === primaryFocusTemplateId)?.title ??
    library.focusTemplates.find((template) => template.id === selectedGoalTemplateId || template.legacyGoalTemplateIds?.includes(selectedGoalTemplateId))?.title ??
    library.goalTemplates.find((template) => template.id === selectedGoalTemplateId)?.title ??
    library.teamFocusTemplates.find((template) => template.id === selectedTeamFocusTemplateId)?.title ??
    null
  );
}

function validateTemplateIds(body, library) {
  const context = VALID_CONTEXTS.has(body.context) ? body.context : "personal";
  const role = VALID_ROLES.has(body.role) ? body.role : "ADC";
  const shouldCreatePersonal = context === "personal" || context === "both";
  const shouldCreateTeam = context === "team" || context === "both";
  const goalTemplate = library.goalTemplates.find(
    (template) => template.id === body.selectedGoalTemplateId
  );
  const legacyFocusTemplate = library.focusTemplates.find(
    (template) => template.id === body.selectedGoalTemplateId || template.legacyGoalTemplateIds?.includes(body.selectedGoalTemplateId)
  );
  const primaryFocusTemplate = library.focusTemplates.find(
    (template) => template.id === (body.primaryFocusTemplateId ?? body.selectedFocusTemplateId)
  ) ?? legacyFocusTemplate;
  const teamFocusTemplate = library.teamFocusTemplates.find(
    (template) => template.id === body.selectedTeamFocusTemplateId
  );
  const actionTemplate = body.selectedActionTemplateId
    ? library.actionTemplates.find((template) => template.id === body.selectedActionTemplateId)
    : null;

  if (shouldCreatePersonal && !goalTemplate && !legacyFocusTemplate) {
    throw badRequest("Select a valid goal template.");
  }

  if (shouldCreatePersonal && !primaryFocusTemplate) {
    throw badRequest("Select a valid primary focus.");
  }

  if (shouldCreateTeam && !teamFocusTemplate) {
    throw badRequest("Select a valid team focus template.");
  }

  if (body.selectedActionTemplateId && !actionTemplate) {
    throw badRequest("Select a valid review priority.");
  }

  const signalIds = new Set(library.signalTemplates.map((template) => template.id));
  const metricIds = new Set(library.metricTemplates.map((template) => template.id));
  const focusIds = new Set(library.focusTemplates.map((template) => template.id));
  const selectedSignalIds = Array.isArray(body.selectedSignalIds)
    ? body.selectedSignalIds.map((value) => String(value ?? "").trim()).filter(Boolean)
    : [];
  const selectedMetricIds = Array.isArray(body.selectedMetricIds)
    ? body.selectedMetricIds.map((value) => String(value ?? "").trim()).filter(Boolean)
    : [];
  const supportingFocusTemplateIds = Array.isArray(body.supportingFocusTemplateIds)
    ? body.supportingFocusTemplateIds.map((value) => String(value ?? "").trim()).filter(Boolean)
    : [];
  const laterFocusTemplateIds = Array.isArray(body.laterFocusTemplateIds)
    ? body.laterFocusTemplateIds.map((value) => String(value ?? "").trim()).filter(Boolean)
    : [];

  const invalidSignalId = selectedSignalIds.find((signalId) => !signalIds.has(signalId));
  if (invalidSignalId) {
    throw badRequest(`Unknown signal template: ${invalidSignalId}`);
  }
  const invalidMetricId = selectedMetricIds.find((metricId) => !metricIds.has(metricId));
  if (invalidMetricId) {
    throw badRequest(`Unknown metric template: ${invalidMetricId}`);
  }
  const invalidFocusId = [...supportingFocusTemplateIds, ...laterFocusTemplateIds]
    .find((focusId) => !focusIds.has(focusId));
  if (invalidFocusId) {
    throw badRequest(`Unknown focus template: ${invalidFocusId}`);
  }

  const targets = Array.isArray(body.targets) ? body.targets : [];
  targets.forEach((target) => {
    if (!target || !metricIds.has(target.metricId)) {
      throw badRequest("Targets must reference valid metric templates.");
    }
    if (!Number.isFinite(Number(target.value ?? target.targetValue))) {
      throw badRequest("Target values must be numeric.");
    }
  });

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
    selectedGoalTemplateId: goalTemplate?.id ?? body.selectedGoalTemplateId,
    primaryFocusTemplateId: primaryFocusTemplate?.id,
    supportingFocusTemplateIds,
    laterFocusTemplateIds,
    selectedSignalIds,
    selectedMetricIds,
    targets: targets.map((target) => ({
      id: target.id,
      metricId: target.metricId,
      operator: target.operator ?? "<=",
      value: Number(target.value ?? target.targetValue),
      window: target.window ?? "week",
      label: target.label
    })),
    weeklyTargets: weeklyTargets.map((target) => ({
      signalId: target.signalId,
      targetValue: Number(target.targetValue),
      label: target.label
    }))
  };
}

export function createOnboardingRouter({ config, goalTypesRepository, userHomesRepository }) {
  const router = express.Router();
  const requireAuth = config.requireAuth;

  router.get("/options", async (_request, response) => {
    const systemGoalTypes = goalTypesRepository
      ? await goalTypesRepository.listGoalTypes({ activeOption: true })
      : getSystemGoalTypes().filter((goalType) => goalType.isActiveOption);

    response.json({
      templates: getTemplateLibrary(),
      systemGoalTypes
    });
  });

  router.post("/", requireAuth, async (request, response) => {
    const library = getTemplateLibrary();
    const validated = validateTemplateIds(request.body ?? {}, library);
    const ownerId = request.identity?.id ?? config.demoUserId;
    const existingHome =
      (await userHomesRepository.getUserHome(ownerId)) ?? defaultHomeRecord(ownerId, request.identity);
    const teamId = request.body?.teamId ?? `${ownerId}-team`;
    const focusArea = resolveSelectedFocusArea({
      context: validated.context,
      library,
      selectedGoalTemplateId: request.body?.selectedGoalTemplateId,
      primaryFocusTemplateId: validated.primaryFocusTemplateId,
      selectedTeamFocusTemplateId: request.body?.selectedTeamFocusTemplateId
    });
    const goalDashboard = buildOnboardingGoalDashboardState({
      ...validated,
      ownerId,
      teamId,
      selectedGoalTemplateId: validated.selectedGoalTemplateId,
      primaryFocusTemplateId: validated.primaryFocusTemplateId,
      supportingFocusTemplateIds: validated.supportingFocusTemplateIds,
      laterFocusTemplateIds: validated.laterFocusTemplateIds,
      selectedActionTemplateId: request.body?.selectedActionTemplateId,
      selectedTeamFocusTemplateId: request.body?.selectedTeamFocusTemplateId
    });
    const saved = await userHomesRepository.saveUserHome({
      ...existingHome,
      id: ownerId,
      profile: {
        ...existingHome.profile,
        displayName:
          normalizeNonEmptyString(existingHome.profile?.displayName) ??
          normalizeNonEmptyString(request.identity?.displayName) ??
          "Player",
        teamName: normalizeNonEmptyString(existingHome.profile?.teamName),
        primaryRole: validated.role,
        focusArea: focusArea ?? normalizeNonEmptyString(existingHome.profile?.focusArea)
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
