/**
 * @typedef {"Top" | "Jungle" | "Mid" | "ADC" | "Support" | "Multiple"} Role
 * @typedef {{ signalId: string, targetValue: number, label?: string }} TargetTemplate
 * @typedef {{ id: string, title: string, role?: Role, scope: "personal" | "team", category: string, description: string, defaultSignalIds: string[], defaultActionIds: string[], relatedContentIds: string[], suggestedWeeklyTargets?: TargetTemplate[] }} GoalTemplate
 * @typedef {{ id: string, label: string, type: "count" | "rating" | "boolean" | "note", polarity: "positive" | "negative" | "neutral", description: string, reviewPrompt?: string, roles?: Role[], categories?: string[] }} SignalTemplate
 * @typedef {{ id: string, title: string, type: "review" | "lesson" | "drill" | "checklist" | "reflection", estimatedMinutes: number, description: string, steps: string[], producesSignalIds?: string[], linkedGoalTemplateIds?: string[], linkedTeamFocusTemplateIds?: string[], ctaLabel?: string, href?: string }} ActionTemplate
 * @typedef {{ id: string, title: string, type: "lesson" | "checklist" | "decision-tree" | "drill" | "reference", roles?: Role[], categories: string[], linkedGoalTemplateIds?: string[], linkedTeamFocusTemplateIds?: string[], summary: string, body: string }} ContentTemplate
 * @typedef {{ id: string, title: string, category: string, description: string, defaultChecklist: string[], defaultSignalIds: string[], defaultActionIds: string[], relatedContentIds: string[], practiceTopic?: string, assignedReview?: string }} TeamFocusTemplate
 * @typedef {{ signalId: string, targetValue: number, currentValue?: number | null, status?: "on-track" | "missed" | "needs-review", label?: string }} ActiveTarget
 * @typedef {{ id: string, templateId: string, ownerType: "player" | "team", ownerId: string, status: "active" | "paused" | "completed", activeSince: string, weeklyTargets: ActiveTarget[], selectedSignalIds: string[], selectedActionIds: string[] }} ActiveGoalInstance
 * @typedef {{ id: string, templateId: string, ownerType: "team", ownerId: string, status: "active" | "paused" | "completed", activeSince: string, selectedSignalIds: string[], selectedActionIds: string[], checklist?: string[] }} ActiveTeamFocusInstance
 * @typedef {{ id: string, ownerId: string, sourceType: "solo-queue" | "scrim" | "vod" | "manual", matchId?: string, timestampInGame?: string, signalId: string, goalInstanceId?: string, teamFocusInstanceId?: string, value: number | string | boolean, note?: string, createdAt: string }} EvidenceEvent
 * @typedef {{ id: string, actionTemplateId: string, reason: string, linkedGoalInstanceId?: string, linkedTeamFocusInstanceId?: string, priority: "low" | "medium" | "high" }} Recommendation
 */

export {};
