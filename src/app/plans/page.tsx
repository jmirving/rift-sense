import Link from "next/link";
import { plans } from "@/lib/sample-data";

export default function PlansPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Plans</h1>
          <p className="text-slate-600">Shared planning space with calm, supportive language.</p>
        </div>
        <Link className="button" href="/plans/new">
          Create plan
        </Link>
      </div>

      <div className="grid gap-4">
        {plans.map((plan) => (
          <Link key={plan.id} href={`/plans/${plan.id}`} className="card block space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-semibold text-slate-900">{plan.title}</h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {plan.status}
              </span>
            </div>
            <p className="text-sm text-slate-600">{plan.summary}</p>
            <p className="text-xs text-slate-500">
              Owner: {plan.owner} • Updated {plan.updatedAt}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
