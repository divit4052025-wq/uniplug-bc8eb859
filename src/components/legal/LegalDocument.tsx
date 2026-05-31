import type { ComponentPropsWithoutRef } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Nav } from "@/components/site/Nav";
import { Footer } from "@/components/site/Footer";

/**
 * Shared chrome for the public legal pages (/terms, /privacy, /mentor-terms,
 * /refund-policy, /community-guidelines, /cookie-policy). Each route imports its
 * source markdown from legal-source/*.md as a raw string and passes it here; the
 * text is rendered VERBATIM — we only style the elements. No paraphrasing, no
 * placeholder substitution.
 *
 * Brand: Fraunces (font-display) headings + Inter body, dusty-rose (#C4907F)
 * accents, rounded, no emojis. Body copy uses near-black on cream (well past
 * WCAG AA); links are high-contrast dark text with a rose underline so colour is
 * never the only cue (WCAG 1.4.1) and contrast stays AA (1.4.3).
 */

// react-markdown passes a `node` prop we must not forward to the DOM element.
type MdProps<T extends keyof React.JSX.IntrinsicElements> = ComponentPropsWithoutRef<T> & {
  node?: unknown;
};

const components = {
  h1: ({ node: _n, ...props }: MdProps<"h1">) => (
    <h1
      className="mt-2 font-display text-[32px] font-bold leading-tight text-[#1A1A1A] md:text-[40px]"
      {...props}
    />
  ),
  h2: ({ node: _n, ...props }: MdProps<"h2">) => (
    <h2
      className="mt-10 border-b border-[#EDE0DB] pb-2 font-display text-[22px] font-semibold text-[#1A1A1A] md:text-[26px]"
      {...props}
    />
  ),
  h3: ({ node: _n, ...props }: MdProps<"h3">) => (
    <h3 className="mt-7 font-display text-[18px] font-semibold text-[#1A1A1A]" {...props} />
  ),
  h4: ({ node: _n, ...props }: MdProps<"h4">) => (
    <h4 className="mt-5 font-display text-[16px] font-semibold text-[#1A1A1A]" {...props} />
  ),
  p: ({ node: _n, ...props }: MdProps<"p">) => (
    <p className="mt-4 text-[15px] leading-relaxed text-[#1A1A1A]/80" {...props} />
  ),
  ul: ({ node: _n, ...props }: MdProps<"ul">) => (
    <ul
      className="mt-4 list-disc space-y-1.5 pl-6 text-[15px] leading-relaxed text-[#1A1A1A]/80 marker:text-[#C4907F]"
      {...props}
    />
  ),
  ol: ({ node: _n, ...props }: MdProps<"ol">) => (
    <ol
      className="mt-4 list-decimal space-y-1.5 pl-6 text-[15px] leading-relaxed text-[#1A1A1A]/80 marker:text-[#C4907F]"
      {...props}
    />
  ),
  li: ({ node: _n, ...props }: MdProps<"li">) => <li className="pl-1" {...props} />,
  a: ({ node: _n, ...props }: MdProps<"a">) => (
    <a
      className="font-medium text-[#1A1A1A] underline decoration-[#C4907F] decoration-2 underline-offset-2 transition hover:text-[#C4907F]"
      {...props}
    />
  ),
  strong: ({ node: _n, ...props }: MdProps<"strong">) => (
    <strong className="font-semibold text-[#1A1A1A]" {...props} />
  ),
  em: ({ node: _n, ...props }: MdProps<"em">) => <em className="italic" {...props} />,
  blockquote: ({ node: _n, ...props }: MdProps<"blockquote">) => (
    <blockquote
      className="mt-5 rounded-r-lg border-l-4 border-[#E8C4B8] bg-[#EDE0DB]/30 py-2 pl-4 pr-3 text-[15px] leading-relaxed text-[#1A1A1A]/75 [&>p]:mt-0"
      {...props}
    />
  ),
  hr: ({ node: _n, ...props }: MdProps<"hr">) => (
    <hr className="my-8 border-t border-[#EDE0DB]" {...props} />
  ),
  table: ({ node: _n, ...props }: MdProps<"table">) => (
    <div className="mt-5 overflow-x-auto">
      <table
        className="w-full border-collapse overflow-hidden rounded-lg border border-[#EDE0DB] text-left text-[14px]"
        {...props}
      />
    </div>
  ),
  thead: ({ node: _n, ...props }: MdProps<"thead">) => (
    <thead className="bg-[#EDE0DB]/40" {...props} />
  ),
  th: ({ node: _n, ...props }: MdProps<"th">) => (
    <th
      className="border border-[#EDE0DB] px-3 py-2 font-display text-[14px] font-semibold text-[#1A1A1A]"
      {...props}
    />
  ),
  td: ({ node: _n, ...props }: MdProps<"td">) => (
    <td className="border border-[#EDE0DB] px-3 py-2 align-top text-[#1A1A1A]/80" {...props} />
  ),
  code: ({ node: _n, ...props }: MdProps<"code">) => (
    <code
      className="rounded bg-[#EDE0DB]/50 px-1.5 py-0.5 font-mono text-[13px] text-[#1A1A1A]"
      {...props}
    />
  ),
};

export function LegalDocument({ content }: { content: string }) {
  return (
    <div className="min-h-screen bg-[#FFFCFB]">
      <Nav />
      <main className="mx-auto max-w-3xl px-6 pb-24 pt-16 md:px-10 md:pt-20">
        <p className="text-[12px] font-medium uppercase tracking-widest text-[#C4907F]">Legal</p>
        <article className="mt-3">
          <Markdown remarkPlugins={[remarkGfm]} components={components}>
            {content}
          </Markdown>
        </article>
      </main>
      <Footer />
    </div>
  );
}
