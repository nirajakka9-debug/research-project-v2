export const NON_DIAGNOSTIC_NOTICE =
  "MindTrack is a non-diagnostic wellness research and personal-baseline monitoring tool. " +
  "It does NOT detect, diagnose, or classify stress, depression, anxiety, or any medical or " +
  "psychiatric condition, and does NOT compute a clinical stress score.";

export const SUPPORTED_VIDEO_EXTENSIONS = new Set([".mp4", ".avi", ".mov", ".mkv", ".webm"]);
export const SUPPORTED_AUDIO_EXTENSIONS = new Set([".wav"]);

export const MAX_VIDEO_SIZE_BYTES = 150 * 1024 * 1024; // 150 MB
export const MAX_AUDIO_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
export const DEFAULT_FACE_MAX_DURATION_SEC = 30.0;
export const MAX_FACE_DURATION_SEC = 30.0;
export const MIN_FACE_DURATION_SEC = 1.0;

const SAFE_USER_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

export function validateSafeUserId(userId: unknown): string {
  if (typeof userId !== "string" || !userId.trim()) {
    throw new Error("User ID must be a non-empty string.");
  }
  const cleaned = userId.trim();
  if (!SAFE_USER_ID_REGEX.test(cleaned)) {
    throw new Error(
      "User ID must be 1-64 characters containing only letters, numbers, underscores, or hyphens.",
    );
  }
  return cleaned;
}

export function normalizeUtcIso(ts: string | Date): string {
  if (ts instanceof Date) {
    return ts.toISOString();
  }
  const raw = String(ts).trim();
  if (!raw) return new Date().toISOString();
  // Handle SQLite "YYYY-MM-DD HH:MM:SS.ffffff" naive UTC timestamps
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(raw)) {
    const isoCandidate = raw.replace(" ", "T") + "Z";
    const parsed = new Date(isoCandidate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}
