export { getTemplateLibrary } from "./templates.js";
export { buildDefaultGoalDashboardState, buildOnboardingGoalDashboardState } from "./seeds.js";
export { resolveGoalDashboardState } from "./resolve.js";
export { normalizeGoalDashboard } from "./normalize.js";
export { buildGoalProgress } from "./progress.js";
export {
  evaluateEvidenceGoalMatch,
  linkParsedEvidenceToGoals,
  matchEvidenceToGoals
} from "./evidence-goal-linking.js";

import { buildDefaultGoalDashboardState } from "./seeds.js";
import { resolveGoalDashboardState } from "./resolve.js";

export function buildDefaultGoalDashboard(now = new Date()) {
  return resolveGoalDashboardState(buildDefaultGoalDashboardState(now));
}
