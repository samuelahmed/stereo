import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Agent output rendered as real markdown. react-markdown never injects raw
 * HTML from the source text, so agent output is safe to render directly.
 */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
