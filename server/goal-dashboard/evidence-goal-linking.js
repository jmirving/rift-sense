function normalizeString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeScopeValue(value) {
  return normalizeString(value)?.toLowerCase() ?? null;
}

function normalizeRole(value) {
  const role = normalizeString(value)?.toUpperCase() ?? null;
  if (!role) {
    return null;
  }

  if (role === "BOTTOM") {
    return "ADC";
  }
  if (role === "UTILITY") {
    return "SUPPORT";
  }

  return role;
}

function normalizeGoalTypes(goalTypes = []) {
  if (goalTypes instanceof Map) {
    return goalTypes;
  }

  if (Array.isArray(goalTypes)) {
    return new Map(goalTypes.map((goalType) => [goalType.id, goalType]));
  }

  return new Map(Object.entries(goalTypes ?? {}));
}

function tagIds(evidence) {
  return Array.isArray(evidence?.tags)
    ? evidence.tags.map((tag) => normalizeString(tag?.id ?? tag)).filter(Boolean)
    : [];
}

function isActiveGoal(goal) {
  return goal?.active === true || goal?.status === "active";
}

function goalTypeId(goal) {
  return normalizeString(goal?.goalTypeId ?? goal?.typeId);
}

function matchReason({ categoryMatch = false, matchedTags = [], skippedByRoleScope = false, skippedByChampionScope = false } = {}) {
  return {
    categoryMatch,
    matchedTags,
    skippedByRoleScope,
    skippedByChampionScope
  };
}

export function evaluateEvidenceGoalMatch(evidence, goal, goalType) {
  const evidenceId = normalizeString(evidence?.id);
  const goalId = normalizeString(goal?.id);
  const reason = matchReason();

  if (!evidenceId || !goalId || !goalType) {
    return {
      evidenceId,
      goalId,
      goalTypeId: goalTypeId(goal),
      matched: false,
      matchReason: reason
    };
  }

  const scopedRole = normalizeRole(goal.role);
  const evidenceRole = normalizeRole(evidence?.playerRole);
  if (scopedRole && scopedRole !== "ANY" && scopedRole !== evidenceRole) {
    reason.skippedByRoleScope = true;
    return {
      evidenceId,
      goalId,
      goalTypeId: goalType.id,
      matched: false,
      matchReason: reason
    };
  }

  const championScope = Array.isArray(goal.championScope)
    ? goal.championScope.map(normalizeScopeValue).filter(Boolean)
    : [];
  if (championScope.length > 0 && !championScope.includes(normalizeScopeValue(evidence?.championName))) {
    reason.skippedByChampionScope = true;
    return {
      evidenceId,
      goalId,
      goalTypeId: goalType.id,
      matched: false,
      matchReason: reason
    };
  }

  const evidenceCategory = normalizeString(evidence?.category);
  const evidenceCategories = Array.isArray(goalType.evidenceCategories) ? goalType.evidenceCategories : [];
  const tagSubscriptions = new Set(Array.isArray(goalType.tagSubscriptions) ? goalType.tagSubscriptions : []);
  reason.categoryMatch = evidenceCategory ? evidenceCategories.includes(evidenceCategory) : false;
  reason.matchedTags = tagIds(evidence).filter((tagId) => tagSubscriptions.has(tagId));

  return {
    evidenceId,
    goalId,
    goalTypeId: goalType.id,
    matched: reason.categoryMatch || reason.matchedTags.length > 0,
    matchReason: reason
  };
}

export function matchEvidenceToGoals(evidence, activeGoals = [], goalTypes = []) {
  const goalTypeIndex = normalizeGoalTypes(goalTypes);

  return activeGoals
    .filter(isActiveGoal)
    .map((goal) => evaluateEvidenceGoalMatch(evidence, goal, goalTypeIndex.get(goalTypeId(goal))))
    .filter((evaluation) => evaluation.matched)
    .map((evaluation) => ({
      evidenceId: evaluation.evidenceId,
      goalId: evaluation.goalId,
      goalTypeId: evaluation.goalTypeId,
      matchReason: evaluation.matchReason
    }));
}

export function linkParsedEvidenceToGoals({
  parsedEvidence = [],
  activeGoals = [],
  goalTypes = [],
  linkedAt = new Date().toISOString()
} = {}) {
  const evidence = Array.isArray(parsedEvidence) ? parsedEvidence : [];
  const links = evidence.flatMap((item) =>
    matchEvidenceToGoals(item, activeGoals, goalTypes).map((match) => ({
      ...match,
      linkedAt
    }))
  );
  const linkedEvidenceIds = new Set(links.map((link) => link.evidenceId));

  return {
    evidence,
    evidenceGoalLinks: links,
    linkedEvidence: evidence.filter((item) => linkedEvidenceIds.has(item.id)),
    unlinkedEvidence: evidence.filter((item) => !linkedEvidenceIds.has(item.id))
  };
}
