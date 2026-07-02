export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";

export const DEFAULT_CLASSIFICATION_LABELS = [
  "reading",
  "listening",
  "speaking",
  "writing_or_notes",
  "unknown_or_needs_review",
];

export const DEFAULT_UPLOAD_CONFIG = {
  provider: "rclone",
  remote: "ielts-drive",
  basePath: "IELTS/submissions",
};
