import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Agent output rendered as real markdown. react-markdown never injects raw
 * HTML from the source text, so agent output is safe to render directly.
 */
export function Markdown({ text, onOpenLink }: { text: string; onOpenLink(href: string): void }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, node: _node, ...props }) => (
            <a
              {...props}
              href={href}
              onClick={(event) => {
                event.preventDefault();
                if (href) onOpenLink(href);
              }}
            >
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
