import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/Markdown";
import { plans } from "@/lib/sample-data";

type PageProps = { params: { slug: string } };

export default function SharePlanPage({ params }: PageProps) {
  const plan = plans.find((item) => item.shareSlug === params.slug);

  if (!plan) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <div className="card space-y-2">
        <p className="label">Shared plan view</p>
        <h1 className="text-3xl font-semibold text-slate-900">{plan.title}</h1>
        <p className="text-slate-600">{plan.summary}</p>
        <p className="text-sm text-slate-500">Owner: {plan.owner}</p>
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

      <div className="card space-y-3">
        <p className="label">Collaboration</p>
        <p className="text-sm text-slate-600">
          This view is read-only to keep the shared context consistent.
        </p>
        <Link className="button-secondary" href={`/plans/${plan.id}`}>
          Open full plan
        </Link>
      </div>
    </div>
  );
}
