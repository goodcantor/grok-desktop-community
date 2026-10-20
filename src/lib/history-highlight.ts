/** Highlight ranges without replacing text nodes owned by React. */
export function highlightHistoryMatch(
  root: HTMLElement,
  ordinal: number | null,
  query: string,
) {
  const target =
    root.querySelector<HTMLElement>(`[data-history-ordinal="${ordinal}"]`) ||
    root.querySelector<HTMLElement>(".history-item");
  if (!target) return () => {};
  target.classList.add("history-match");
  const words = query.split(/[^\p{L}\p{N}_]+/u).filter(Boolean);
  const matches: Range[] = [];
  if (words.length) {
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    for (const node of nodes) {
      if (node.parentElement?.closest("button,mark,.meta")) continue;
      const value = node.textContent || "";
      const lower = value.toLocaleLowerCase();
      const ranges: { start: number; end: number }[] = [];
      for (const word of words) {
        let pos = 0;
        while ((pos = lower.indexOf(word.toLocaleLowerCase(), pos)) >= 0) {
          ranges.push({ start: pos, end: pos + word.length });
          pos += word.length;
        }
      }
      ranges.sort((a, b) => a.start - b.start);
      if (!ranges.length) continue;
      let offset = 0;
      for (const range of ranges) {
        if (range.start < offset) continue;
        const match = new Range();
        match.setStart(node, range.start);
        match.setEnd(node, range.end);
        matches.push(match);
        offset = range.end;
      }
    }
  }
  // Available in the bundled Electron runtime. Older browsers retain the focus outline.
  const highlights = (CSS as unknown as { highlights?: Map<string, unknown> })
    .highlights;
  const HighlightClass = (
    window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }
  ).Highlight;
  if (highlights && HighlightClass)
    highlights.set("history-query", new HighlightClass(...matches));
  target.scrollIntoView({ block: "center" });
  return () => {
    target.classList.remove("history-match");
    highlights?.delete("history-query");
  };
}
