export type LoginProgress = {
  output?: string;
  url?: string | null;
  urls?: string[];
  userCode?: string | null;
  needsPaste?: boolean;
  deviceAuth?: boolean;
};

export type AuthStatus = {
  binary: string;
  binaryFound: boolean;
  grokHome: string;
  authPath: string;
  authenticated: boolean;
  method: string | null;
  email: string | null;
  displayName: string | null;
  expiresAt: string | null;
  expired: boolean;
  hasApiKey: boolean;
  loginInProgress: boolean;
};

export type GrokEngineInfo = {
  binary: string;
  binaryFound: boolean;
  version: string | null;
  error?: string;
};

export type GrokUpdateCheck = {
  ok: boolean;
  updateAvailable: boolean;
  currentVersion: string | null;
  latestVersion: string | null;
  channel?: string | null;
  error?: string | null;
};

export type GrokUpdateInstall = {
  ok: boolean;
  stdout?: string;
  stderr?: string;
  error?: string | null;
};
