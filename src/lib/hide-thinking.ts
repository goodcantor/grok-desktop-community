/** Display preference: fold thinking blocks in the transcript. */

const HIDE_THINKING_KEY = "grok-desktop-hide-thinking";

/** Missing key stays hidden — that is the existing transcript default. */
export function readHideThinking(): boolean {
  try {
    const v = localStorage.getItem(HIDE_THINKING_KEY);
    if (v === "0" || v === "false") return false;
    return true;
  } catch {
    return true;
  }
}

export function storeHideThinking(hide: boolean): void {
  try {
    localStorage.setItem(HIDE_THINKING_KEY, hide ? "1" : "0");
  } catch {
    /* private mode / quota */
  }
}
