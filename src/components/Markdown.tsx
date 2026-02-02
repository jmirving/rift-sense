import DOMPurify from "isomorphic-dompurify";
import { marked } from "marked";

export function Markdown({ content }: { content: string }) {
  const html = DOMPurify.sanitize(marked.parse(content));
  return <div className="prose prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: html }} />;
}
