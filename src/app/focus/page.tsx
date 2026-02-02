import Link from "next/link";
import { focusBlocks } from "@/lib/sample-data";

export default function FocusPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-slate-900">Focus blocks</h1>
        <p className="text-slate-600">Keep attention on a few supportive priorities at a time.</p>
      </div>
      <div className="grid gap-4">
        {focusBlocks.map((block) => (
          <Link key={block.id} href={`/focus/${block.id}`} className="card block space-y-2">
            <h2 className="text-xl font-semibold text-slate-900">{block.title}</h2>
            <p className="text-sm text-slate-600">{block.intent}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
