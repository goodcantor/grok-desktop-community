/// <reference types="vite/client" />
import type { DesktopBridge } from "./types/bridge";

declare global {
  interface Window {
    grokDesktop: DesktopBridge;
    __communityReady?: boolean;
    __communityUnsavedEdits?: boolean;
    __grokCopySelectionMarkdown?: () => void;
  }
}

export {};
