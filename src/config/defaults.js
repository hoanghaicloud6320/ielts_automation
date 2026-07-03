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

export const DEFAULT_USER_DATA_ROOT = "user_data";
export const DEFAULT_FETCH_DROP_DIR = "put_image_here_to_fetch_ans";
export const DEFAULT_SUBMIT_DROP_DIR = "put_image_here_to_submit";

export function defaultFetchSessionsRoot() {
  return `${DEFAULT_USER_DATA_ROOT}/fetch_sessions`;
}

export function defaultSubmitSessionsRoot() {
  return `${DEFAULT_USER_DATA_ROOT}/submit_sessions`;
}

export function defaultLessonDir(lessonId) {
  return `${DEFAULT_USER_DATA_ROOT}/les_${lessonId}`;
}

export function defaultFetchInputDir(lessonId) {
  return `${defaultLessonDir(lessonId)}/fetch-ans-input`;
}

export function defaultSubmitDir(lessonId) {
  return `${defaultLessonDir(lessonId)}/submit`;
}
