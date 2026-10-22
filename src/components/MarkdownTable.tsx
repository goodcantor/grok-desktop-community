import type { ReactNode } from 'react';

/** Wide tables scroll independently without crushing headings or widening the chat. */
export function MarkdownTable({ children }: { children?: ReactNode }) {
  return <div className="markdown-table-scroll" role="region" aria-label="Table" tabIndex={0}>
    <table>{children}</table>
  </div>;
}
