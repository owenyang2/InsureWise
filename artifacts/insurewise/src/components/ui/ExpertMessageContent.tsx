import { cn } from "@/lib/utils";

/** Turn inline " - **item**" RAG bullets into proper markdown list lines. */
export function normalizeExpertAnswer(text: string): string {
  if (!/ - \*\*/.test(text)) {
    return text.trim();
  }

  let body = text.trim();
  let tail = "";

  const tailMatch = body.match(/\s+(It was built\b[\s\S]*)$/i);
  if (tailMatch && tailMatch.index !== undefined) {
    tail = tailMatch[1].trim();
    body = body.slice(0, tailMatch.index).trim();
  }

  const parts = body.split(/ - (?=\*\*)/);
  const [intro, ...items] = parts;
  if (items.length === 0) {
    return text.trim();
  }

  const bullets = items.map((item) => `- ${item.trim()}`).join("\n");
  return [intro.trim(), bullets, tail].filter(Boolean).join("\n\n");
}

function renderInline(text: string, keyPrefix: string) {
  const segments = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return segments.map((segment, index) => {
    if (segment.startsWith("**") && segment.endsWith("**")) {
      return (
        <strong key={`${keyPrefix}-strong-${index}`} className="font-semibold text-foreground">
          {segment.slice(2, -2)}
        </strong>
      );
    }
    return <span key={`${keyPrefix}-text-${index}`}>{segment}</span>;
  });
}

function renderBlock(block: string, index: number) {
  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  const listLines = lines.filter((line) => /^[-*]\s+/.test(line));

  if (listLines.length > 0 && listLines.length === lines.length) {
    return (
      <ul key={index} className="my-2 ml-4 list-disc space-y-1.5 marker:text-primary/70">
        {listLines.map((line, lineIndex) => (
          <li key={lineIndex} className="leading-relaxed pl-0.5">
            {renderInline(line.replace(/^[-*]\s+/, ""), `block-${index}-li-${lineIndex}`)}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <p key={index} className="leading-relaxed">
      {renderInline(block.replace(/\n/g, " "), `block-${index}-p`)}
    </p>
  );
}

export function ExpertMessageContent({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const normalized = normalizeExpertAnswer(content);
  const blocks = normalized.split(/\n\n+/).filter(Boolean);

  return (
    <div className={cn("space-y-2 text-sm", className)}>
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  );
}
