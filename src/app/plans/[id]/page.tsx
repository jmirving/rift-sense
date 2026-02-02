import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/Markdown";
import { PlanWorkflow } from "@/components/PlanWorkflow";
import { plans } from "@/lib/sample-data";

type PageProps = { params: { id: string } };

export default function PlanDetailPage({ params }: PageProps) {
  const plan = plans.find((item) => item.id === params.id);

  if (!plan) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href="/plans" className="text-sm font-semibold text-slate-500">
          ← Back to plans
        </Link>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">{plan.title}</h1>
        <p className="text-slate-600">{plan.summary}</p>
        <p className="text-sm text-slate-500">
          Owner: {plan.owner} • Updated {plan.updatedAt}
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        {[
          { label: "Intention", content: plan.core.intention },
          { label: "Values", content: plan.core.values },
          { label: "Scope", content: plan.core.scope },
          { label: "Success signals", content: plan.core.success },
          { label: "Risks to watch", content: plan.core.risks }
        ].map((section) => (
          <div key={section.label} className="card space-y-3">
            <p className="label">{section.label}</p>
            <Markdown content={section.content} />
          </div>
        ))}
      </section>

      <PlanWorkflow
        roles={plan.roleAssignments}
        timeline={plan.timeline}
        notes={plan.reviewNotes}
        shareSlug={plan.shareSlug}
      />
    </div>
  );
}
