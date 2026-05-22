export type VideoStatus =
  | "pending"
  | "uploading"
  | "processing"
  | "completed"
  | "failed";

export interface Video {
  id: string;
  userId: string;
  title: string;
  originalUrl: string;
  duration: number; // seconds
  status: VideoStatus;
  createdAt: string;
  updatedAt: string;
}
