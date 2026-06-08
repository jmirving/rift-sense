export const SYSTEM_GOAL_TYPES = [
  {
    id: "death_review",
    title: "Reduce Avoidable Deaths",
    description:
      "Review death context to separate acceptable deaths from positioning, fight, and map-state mistakes.",
    roleApplicability: ["ANY"],
    evidenceCategories: ["death_review"],
    tagSubscriptions: [
      "low_hp_positioning",
      "tower_damage_relevant",
      "minion_damage_relevant",
      "enemy_level_timing_before_death",
      "lost_fight_stagger",
      "numbers_disadvantage_or_collapse",
      "post_objective_map_shift",
      "low_return_damage",
      "high_return_damage"
    ],
    defaultReviewQuestions: [
      "What information was available before the death?",
      "Was the death required for a trade, objective, or team call?",
      "What should change before the next similar position?"
    ],
    createdBySystem: true,
    isActiveOption: true
  },
  {
    id: "tempo_conversion",
    title: "Convert Plays Cleanly",
    description:
      "Review whether kills, towers, plates, and objectives turn into rewards or get traded back.",
    roleApplicability: ["ANY"],
    evidenceCategories: ["tempo_conversion"],
    tagSubscriptions: [
      "clean_conversion",
      "failed_conversion",
      "overstay_after_conversion",
      "tempo_spent_but_stayed",
      "reset_window_missed",
      "objective_into_death",
      "baron_exit_failure",
      "kill_into_no_plate",
      "enemy_crossmap_trade"
    ],
    defaultReviewQuestions: [
      "What did we get from the play?",
      "What did the enemy get back?",
      "Was the next action reset, rotate, crash, or continue?"
    ],
    createdBySystem: true,
    isActiveOption: true
  },
  {
    id: "objective_setup_exit",
    title: "Improve Objective Setup and Exit",
    description:
      "Review whether the team arrived with usable setup and left major objectives without giving tempo back.",
    roleApplicability: ["ANY"],
    evidenceCategories: ["objective_setup_exit"],
    tagSubscriptions: [
      "objective_setup_present",
      "objective_setup_missing",
      "objective_taken_cleanly",
      "objective_taken_but_exit_failed",
      "objective_contested_and_lost",
      "post_major_objective_death",
      "enemy_objective_crossmap_trade"
    ],
    defaultReviewQuestions: [
      "Did we enter the objective with lane, vision, and reset timing?",
      "What was the exit call after the objective?",
      "What enemy trade did we allow before or after the objective?"
    ],
    createdBySystem: true,
    isActiveOption: true
  },
  {
    id: "fight_participation",
    title: "Arrive to Fights Correctly",
    description:
      "Review whether fight timing, presence, damage, and deaths matched the intended team call.",
    roleApplicability: ["ANY"],
    evidenceCategories: ["fight_participation"],
    tagSubscriptions: [
      "late_to_fight",
      "absent_from_fight",
      "died_before_fight",
      "high_damage_losing_fight",
      "low_damage_death"
    ],
    defaultReviewQuestions: [
      "Was the fight supposed to be contested, traded, delayed, or given?",
      "Did I arrive before the fight was decided?",
      "Did my position let me contribute without dying early?"
    ],
    createdBySystem: true,
    isActiveOption: true
  },
  {
    id: "map_state_safety",
    title: "Recognize Unsafe Map States",
    description:
      "Review danger created by recent objectives, deaths, tower states, enemy access, and re-entry timing.",
    roleApplicability: ["ANY"],
    evidenceCategories: ["map_state_safety", "death_review", "tempo_conversion", "objective_setup_exit"],
    tagSubscriptions: [
      "post_objective_map_shift",
      "tower_defense_context",
      "enemy_carry_access",
      "overstay_after_conversion",
      "recent_death_reentry"
    ],
    defaultReviewQuestions: [
      "What changed on the map before this position became unsafe?",
      "Which enemy champions could reach the area first?",
      "What safer route, timing, or wave state was available?"
    ],
    createdBySystem: true,
    isActiveOption: true
  },
  {
    id: "lane_pressure_conversion",
    title: "Turn Lane Pressure Into Rewards",
    description:
      "Review whether lane pressure became plates, crashes, resets, roams, or other durable advantages.",
    roleApplicability: ["ANY"],
    evidenceCategories: ["lane_pressure_conversion", "lane_pressure", "tempo_conversion"],
    tagSubscriptions: [
      "plate_conversion",
      "pressure_without_conversion",
      "plate_loss_after_death",
      "crash_or_reset_possible"
    ],
    defaultReviewQuestions: [
      "What pressure did the lane create?",
      "Could that pressure become a plate, crash, reset, roam, or objective setup?",
      "What prevented the conversion?"
    ],
    createdBySystem: true,
    isActiveOption: true
  },
  {
    id: "vision_information",
    title: "Improve Vision and Information",
    description:
      "Review whether warding, objective information, and recent vision supported the next decision.",
    roleApplicability: ["ANY"],
    evidenceCategories: ["vision_information"],
    tagSubscriptions: [
      "low_vision_activity",
      "objective_without_recent_vision",
      "death_after_no_recent_ward",
      "control_ward_missing"
    ],
    defaultReviewQuestions: [
      "What information was missing before the decision?",
      "Which ward, sweep, or teammate information would have changed the play?",
      "Was the objective or map move started with enough recent vision?"
    ],
    createdBySystem: true,
    isActiveOption: true
  }
];

export function getSystemGoalTypes() {
  return SYSTEM_GOAL_TYPES.map((goalType) => ({
    ...goalType,
    roleApplicability: [...goalType.roleApplicability],
    evidenceCategories: [...goalType.evidenceCategories],
    tagSubscriptions: [...goalType.tagSubscriptions],
    defaultReviewQuestions: [...goalType.defaultReviewQuestions]
  }));
}

export async function seedSystemGoalTypes(goalTypesRepository) {
  const seeded = [];

  for (const goalType of getSystemGoalTypes()) {
    const existing = await goalTypesRepository.getGoalType(goalType.id);
    const nextGoalType = existing
      ? {
          ...existing,
          ...goalType,
          createdBySystem: true,
          isActiveOption: goalType.isActiveOption
        }
      : goalType;

    await goalTypesRepository.saveGoalType(nextGoalType);
    seeded.push(nextGoalType);
  }

  return seeded;
}
