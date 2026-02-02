import Link from "next/link";
import { players } from "@/lib/sample-data";

export default function NewPlanPage() {
  return (
    <div className="space-y-8">
      <div>
        <Link href="/plans" className="text-sm font-semibold text-slate-500">
          ← Back to plans
        </Link>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">Create a new plan</h1>
        <p className="text-slate-600">
          Start with intention, scope, and a supportive cadence.
        </p>
      </div>

      <form className="space-y-6">
        <div className="card space-y-4">
          <p className="label">Plan overview</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Plan title</label>
              <input className="input" placeholder="Example: Calm rollout plan" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Owner</label>
              <select className="input">
                {players.map((player) => (
                  <option key={player.id} value={player.name}>
                    {player.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Summary</label>
            <textarea
              className="textarea"
              placeholder="Describe the plan in a supportive, non-pressuring way."
              rows={4}
            />
          </div>
        </div>

        <div className="card space-y-4">
          <p className="label">Core sections</p>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              "Intention",
              "Values",
              "Scope",
              "Success signals",
              "Risks to watch"
            ].map((label) => (
              <div key={label} className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">{label}</label>
                <textarea className="textarea" rows={4} placeholder={`Add ${label.toLowerCase()}...`} />
              </div>
            ))}
          </div>
        </div>

        <div className="card space-y-4">
          <p className="label">Next steps</p>
          <p className="text-sm text-slate-600">
            You can refine roles, timeline steps, and notes after saving.
          </p>
          <button type="button" className="button">
            Save plan draft
          </button>
        </div>
      </form>
    </div>
  );
}
