export type ExternalEditorInfo = {
  id: string;
  label: string;
  available: boolean;
  lastResort: boolean;
};

export type EditorListResult = {
  preferred: string;
  resolved: string | null;
  resolvedLabel: string | null;
  editors: ExternalEditorInfo[];
};

export type FileReadResult = {
  text: string;
  binary: boolean;
  truncated: boolean;
  size: number;
};
