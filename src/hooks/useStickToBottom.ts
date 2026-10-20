import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,useState,
  type RefObject,
} from "react";

/** Within this many px of the bottom we treat the viewport as "pinned". */
const NEAR_BOTTOM_PX = 80;

function isScrollerNearBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
}

/**
 * Chat-style stick-to-bottom for a scroll container.
 *
 * - Follows the tail while the user is pinned.
 * - Unlocks when they scroll up; re-pins when they return to the bottom.
 * - Programmatic stick writes are ignored by the scroll listener (nested
 *   counter + double rAF) so fast streams cannot falsely unlock.
 * Pair with `overflow-anchor: none` on the scroller.
 */
export function useStickToBottom(
  scrollerRef: RefObject<HTMLElement | null>,
  /** Fingerprint of content that should trigger a stick pass (not idle polls). */
  contentKey: string | number,
  /** Project/session switch — re-pin and rebind the listener. */
  resetKey: string | number,
  suspended=false,
): {
  /** Call when the user intentionally wants the live tail (e.g. send). */
  pinToBottom: () => void;
  atLatest:boolean;
} {
  const [atLatest,setAtLatest]=useState(true);
  const positionKey='grok-reading:'+resetKey;
  const restoreRef=useRef<{top:number;pinned:boolean}|null>(null);
  const stickRef = useRef(true);
  /**
   * Nested stick writes during fast streams: count (not bool) so an early
   * clear cannot re-enable the scroll listener mid-flight of a later write.
   */
  const ignoreScrollRef = useRef(0);

  const scrollToBottom = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    ignoreScrollRef.current += 1;
    el.scrollTop = el.scrollHeight;
    // Double rAF: let the browser dispatch scroll events from this write first.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        ignoreScrollRef.current = Math.max(0, ignoreScrollRef.current - 1);
      });
    });
  }, [scrollerRef]);

  const pinToBottom = useCallback(() => {
    stickRef.current = true;setAtLatest(true);restoreRef.current=null;
    scrollToBottom();
  }, [scrollToBottom]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const onScroll = () => {
      if (ignoreScrollRef.current > 0||suspended) return;
      stickRef.current = isScrollerNearBottom(el);setAtLatest(stickRef.current);
      try{sessionStorage.setItem(positionKey,JSON.stringify({top:el.scrollTop,pinned:stickRef.current}));}catch{}
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    const onContentResize=()=>{if(stickRef.current&&!suspended)scrollToBottom();};
    window.addEventListener('grok:transcript-resize',onContentResize);
    try{restoreRef.current=JSON.parse(sessionStorage.getItem(positionKey)||'null');}catch{restoreRef.current=null;}
    stickRef.current=restoreRef.current?.pinned??true;setAtLatest(stickRef.current);
    return()=>{el.removeEventListener('scroll',onScroll);window.removeEventListener('grok:transcript-resize',onContentResize);};
  }, [resetKey, scrollerRef,suspended]);

  // Stick before paint so fast chunks never leave a "not at bottom" frame.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el||suspended) return;
    if(restoreRef.current&&!restoreRef.current.pinned){if(el.scrollHeight>el.clientHeight){el.scrollTop=Math.min(restoreRef.current.top,el.scrollHeight-el.clientHeight);restoreRef.current=null;}return;}
    if (!stickRef.current) {
      if (isScrollerNearBottom(el)) stickRef.current = true;
      else return;
    }
    scrollToBottom();
  }, [contentKey, scrollToBottom, scrollerRef,suspended]);

  return { pinToBottom,atLatest };
}
