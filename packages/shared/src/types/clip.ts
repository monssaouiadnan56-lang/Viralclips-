export type ClipStatus = "pending" | "rendering" | "ready" | "failed";

export interface Clip {
  id: string;
  videoId: string;
  userId: string;
  title: string;
  startTime: number; // seconds
  endTime: number; // seconds
  score: number; // 0-100 virality score
  outputUrl: string | null;
  status: ClipStatus;
  createdAt: string;
  updatedAt: string;
}
