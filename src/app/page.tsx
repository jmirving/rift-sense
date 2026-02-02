import Link from "next/link";
import { focusBlocks, plans, rubricCategories, team } from "@/lib/sample-data";

export default function HomePage() {
  return (
    <div className="space-y-10">
      <section className="card space-y-3">
        <p className="label">Team space</p>
        <h1 className="text-3xl font-semibold text-slate-900">{team.name}</h1>
        <p className="text-slate-600">{team.mission}</p>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="card space-y-3">
          <p className="label">Active plans</p>
          <p className="text-sm text-slate-600">
            Create calm, shared plans that honor the team’s bandwidth.
          </p>
          <Link className="button" href="/plans">
            View plans ({plans.length})
          </Link>
        </div>
        <div className="card space-y-3">
          <p className="label">Focus blocks</p>
          <p className="text-sm text-slate-600">Center the next block of work with care.</p>
          <Link className="button" href="/focus">
            Review focus ({focusBlocks.length})
          </Link>
        </div>
        <div className="card space-y-3">
          <p className="label">Rubrics</p>
          <p className="text-sm text-slate-600">
            Shared language for collaboration signals.
          </p>
          <Link className="button" href="/rubric">
            Browse rubrics ({rubricCategories.length})
          </Link>
        </div>
      </section>

      <section className="card space-y-4">
        <p className="label">Quick links</p>
        <div className="flex flex-wrap gap-3">
          <Link className="button-secondary" href="/plans/new">
            Start a new plan
          </Link>
          <Link className="button-secondary" href={`/plans/${plans[0].id}`}>
            Open latest plan
          </Link>
          <Link className="button-secondary" href={`/s/${plans[0].shareSlug}`}>
            Share view
          </Link>
        </div>
      </section>
    </div>
  );
}
