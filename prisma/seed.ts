import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const team = await prisma.team.create({
    data: {
      name: "North Harbor Collective",
      mission: "Coordinate calm, shared goals across the team."
    }
  });

  const players = await prisma.player.createMany({
    data: [
      { name: "Avery Chen", title: "Facilitator", teamId: team.id },
      { name: "Jordan Patel", title: "Strategist", teamId: team.id },
      { name: "Riley Gomez", title: "Storyteller", teamId: team.id },
      { name: "Morgan Lee", title: "Analyst", teamId: team.id },
      { name: "Casey Kim", title: "Connector", teamId: team.id }
    ]
  });

  const focusBlock = await prisma.focusBlock.create({
    data: {
      teamId: team.id,
      title: "Gentle launch prep",
      intent: "Keep the rollout paced and supportive.",
      spotlight: "Onboarding, communication, and handoffs.",
      markdown: `### Focus prompts\n- What will keep the day feeling steady?\n- Where do we need extra clarity?\n- Who needs a check-in?`
    }
  });

  await prisma.rubricCategory.createMany({
    data: [
      {
        title: "Shared Intent",
        description: "Alignment on what matters most and why.",
        prompts: "Notice how the team frames the why behind the work."
      },
      {
        title: "Collaboration Flow",
        description: "How smoothly work moves across the team.",
        prompts: "Look for handoffs that feel supportive and clear."
      },
      {
        title: "Support Signals",
        description: "Ways the team asks for and offers help.",
        prompts: "Watch for early support signals and follow-through."
      }
    ]
  });

  const planOne = await prisma.plan.create({
    data: {
      teamId: team.id,
      title: "Calm rollout plan",
      summary: "Coordinate a low-stress rollout with clear support signals.",
      status: "Draft",
      ownerName: "Avery Chen",
      focusBlockId: focusBlock.id,
      coreSections: {
        create: {
          intention: "Keep the rollout steady while honoring everyone’s pace.",
          values: "Clarity, shared context, and space to pause.",
          scope: "Week 1 launch checklist with daily check-ins.",
          success: "Everyone knows where to ask for support and what comes next.",
          risks: "Unclear handoffs or last-minute pressure."
        }
      },
      roleAssignments: {
        create: [
          { role: Role.Lead, assigneeName: "Avery Chen" },
          { role: Role.Connector, assigneeName: "Casey Kim" }
        ]
      },
      timelineSteps: {
        create: [
          { title: "Prep materials", date: new Date("2025-02-03"), order: 1 },
          { title: "Check-in cadence", date: new Date("2025-02-04"), order: 2 },
          { title: "Soft launch", date: new Date("2025-02-06"), order: 3 }
        ]
      },
      reviewNotes: {
        create: [
          {
            authorName: "Jordan Patel",
            note: "Let’s add a gentle reminder about break coverage."
          }
        ]
      },
      shareLinks: {
        create: [{ slug: "calm-rollout" }]
      }
    }
  });

  await prisma.plan.create({
    data: {
      teamId: team.id,
      title: "Support handoff plan",
      summary: "Define a warm handoff flow for support requests.",
      status: "In progress",
      ownerName: "Riley Gomez",
      focusBlockId: focusBlock.id,
      coreSections: {
        create: {
          intention: "Make handoffs feel friendly and timely.",
          values: "Empathy and clarity.",
          scope: "Shared inbox and daily touch points.",
          success: "Requests move quickly without rework.",
          risks: "Dropped context between teammates."
        }
      },
      roleAssignments: {
        create: [
          { role: Role.Storyteller, assigneeName: "Riley Gomez" },
          { role: Role.Support, assigneeName: "Morgan Lee" }
        ]
      },
      timelineSteps: {
        create: [
          { title: "Define intake", date: new Date("2025-01-29"), order: 1 },
          { title: "Pilot handoff", date: new Date("2025-02-01"), order: 2 }
        ]
      },
      reviewNotes: { create: [] },
      shareLinks: {
        create: [{ slug: "support-handoff" }]
      }
    }
  });

  await prisma.planShareLink.create({
    data: {
      planId: planOne.id,
      slug: "calm-rollout-extended",
      isActive: false,
      expiresAt: new Date("2025-03-01")
    }
  });

  console.log(`Seeded team with ${players.count} players.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
