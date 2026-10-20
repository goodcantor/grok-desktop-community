export type DraftState = {
  missingImages?: string[];
  version?: number;
  revision: number;
  text: string;
  mode: string;
  files: Array<{
    path: string;
    name: string;
    kind: "file" | "folder";
    available?: boolean;
    size?: number;
  }>;
  images: Array<{ id: string; name?: string; data: string; mimeType: string }>;
};
