import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/Markdown";
import { rubricCategories } from "@/lib/sample-data";

type PageProps = { params: { id: string } };

const rubricPrompts: Record<string, string> = {
  "rubric-1": `### Signals to notice
- Clear framing of what matters most
- Shared language for the "why" behind the work
- Space for questions and clarifications`,
  "rubric-2": `### Signals to notice
- Smooth handoffs between teammates
- Consistent check-ins without pressure
- Visibility into blockers and support needs`,
  "rubric-3": `### Signals to notice
- People asking for help early
- Support offered without urgency
- Follow-through after requests`
};

export default function RubricDetailPage({ params }: PageProps) {
  const category = rubricCategories.find((item) => item.id === params.id);

  if (!category) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href="/rubric" className="text-sm font-semibold text-slate-500">
          ← Back to rubrics
        </Link>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">{category.title}</h1>
        <p className="text-slate-600">{category.description}</p>
      </div>

      <section className="card space-y-3">
        <p className="label">Reflection prompts</p>
        <Markdown content={rubricPrompts[category.id]} />
      </section>
    </div>
  );
}
