export interface TranscriptSegment {
  id: number;
  start: number; // seconds
  end: number; // seconds
  text: string;
  confidence: number; // 0-1
}

export interface Transcript {
  videoId: string;
  language: string;
  segments: TranscriptSegment[];
  fullText: string;
}
