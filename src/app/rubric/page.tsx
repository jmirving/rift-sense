import Link from "next/link";
import { rubricCategories } from "@/lib/sample-data";

export default function RubricPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-slate-900">Rubric categories</h1>
        <p className="text-slate-600">
          Shared language for collaboration signals without ranking or scoring.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {rubricCategories.map((category) => (
          <Link key={category.id} href={`/rubric/${category.id}`} className="card block space-y-2">
            <h2 className="text-xl font-semibold text-slate-900">{category.title}</h2>
            <p className="text-sm text-slate-600">{category.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
