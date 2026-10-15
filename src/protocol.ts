export type Speaker = 'candidate' | 'interviewer';
export type AudioFrame = { type: 'audio'; speaker: Speaker; sequence: number; sampleRate: 16000; pcm: ArrayBuffer };
export type TranscriptEvent = { type: 'partial' | 'final' | 'diagnostic'; speaker?: Speaker; text?: string; timestamp?: string; detail?: string };
