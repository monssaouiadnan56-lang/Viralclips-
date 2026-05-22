export type JobType = "transcribe" | "analyze" | "render";
export type JobStatus = "queued" | "running" | "done" | "failed";

export interface Job {
  id: string;
  videoId: string;
  type: JobType;
  status: JobStatus;
  progress: number; // 0-100
  error: string | null;
  createdAt: string;
  updatedAt: string;
}
