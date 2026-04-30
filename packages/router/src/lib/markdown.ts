import { Marked } from "marked";

const MATH_PLACEHOLDER_PREFIX = "xxOPNMATHxx";

type MathBlock = {
  display: boolean;
  body: string;
};

function extractMath(input: string): { stripped: string; blocks: MathBlock[] } {
  const blocks: MathBlock[] = [];
  let stripped = "";
  let i = 0;
  const len = input.length;

  while (i < len) {
    const char = input[i];

    if (char === "\\" && i + 1 < len) {
      const next = input[i + 1];
      if (next === "(" || next === "[") {
        const isDisplay = next === "[";
        const closer = isDisplay ? "\\]" : "\\)";
        const start = i + 2;
        const end = input.indexOf(closer, start);
        if (end !== -1) {
          const body = input.slice(start, end);
          // Skip math handling for purely-numeric \[...\] — these are
          // markdown-escaped citation references like \[3\] or \[1,2\],
          // not display math. Emit the literal [body] instead.
          if (isDisplay && /^[\d\s,;-]+$/.test(body)) {
            stripped += "[" + body + "]";
            i = end + closer.length;
            continue;
          }
          const idx = blocks.length;
          blocks.push({ display: isDisplay, body });
          stripped += `${MATH_PLACEHOLDER_PREFIX}${idx}`;
          i = end + closer.length;
          continue;
        }
      }
      stripped += input[i] + input[i + 1];
      i += 2;
      continue;
    }

    if (char === "`") {
      // skip inline/block code so we don't treat $ inside code as math
      const fence = input.startsWith("```", i) ? "```" : "`";
      const end = input.indexOf(fence, i + fence.length);
      if (end === -1) {
        stripped += input.slice(i);
        break;
      }
      stripped += input.slice(i, end + fence.length);
      i = end + fence.length;
      continue;
    }

    if (char === "$") {
      const isDisplay = input[i + 1] === "$";
      const opener = isDisplay ? "$$" : "$";
      const start = i + opener.length;
      const end = input.indexOf(opener, start);
      if (end === -1) {
        stripped += char;
        i += 1;
        continue;
      }
      const body = input.slice(start, end);
      // Reject $...$ that span multiple lines as inline (likely a stray $).
      if (!isDisplay && body.includes("\n")) {
        stripped += char;
        i += 1;
        continue;
      }
      const idx = blocks.length;
      blocks.push({ display: isDisplay, body });
      stripped += `${MATH_PLACEHOLDER_PREFIX}${idx}`;
      i = end + opener.length;
      continue;
    }

    stripped += char;
    i += 1;
  }

  return { stripped, blocks };
}

function escHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function reinsertMath(html: string, blocks: MathBlock[]): string {
  return html.replace(
    new RegExp(`${MATH_PLACEHOLDER_PREFIX}(\\d+)`, "g"),
    (_match, idx: string) => {
      const block = blocks[Number(idx)];
      if (!block) return "";
      const cls = block.display ? "math math-display" : "math math-inline";
      const content = block.display ? `\\[${block.body}\\]` : `\\(${block.body}\\)`;
      return `<span class="${cls}">${escHtml(content)}</span>`;
    },
  );
}

const marked = new Marked({
  gfm: true,
  breaks: false,
});

export function renderMarkdown(input: string): string {
  const { stripped, blocks } = extractMath(input);
  const html = marked.parse(stripped, { async: false }) as string;
  return reinsertMath(html, blocks);
}

export function markdownExcerpt(input: string, maxChars: number): string {
  const { stripped } = extractMath(input);
  const cleaned = stripped
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(new RegExp(`${MATH_PLACEHOLDER_PREFIX}\\d+`, "g"), "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= maxChars) return cleaned;
  return cleaned.slice(0, maxChars).trimEnd() + "…";
}

export const KATEX_HEAD = `
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css" />
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/contrib/auto-render.min.js" onload="renderMathInElement(document.body,{delimiters:[{left:'\\\\[',right:'\\\\]',display:true},{left:'\\\\(',right:'\\\\)',display:false},{left:'$$',right:'$$',display:true}],throwOnError:false});"></script>
`;
