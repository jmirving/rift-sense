import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/Markdown";
import { focusBlocks } from "@/lib/sample-data";

type PageProps = { params: { id: string } };

export default function FocusDetailPage({ params }: PageProps) {
  const block = focusBlocks.find((item) => item.id === params.id);

  if (!block) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href="/focus" className="text-sm font-semibold text-slate-500">
          ← Back to focus blocks
        </Link>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">{block.title}</h1>
        <p className="text-slate-600">{block.intent}</p>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-2">
          <p className="label">Spotlight</p>
          <p className="text-sm text-slate-700">{block.spotlight}</p>
        </div>
        <div className="card space-y-2">
          <p className="label">Prompts</p>
          <Markdown content={block.markdown} />
        </div>
      </section>
    </div>
  );
}
