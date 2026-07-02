import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { DEFAULT_UPLOAD_CONFIG } from "../config/defaults.js";

const execFileAsync = promisify(execFile);

export async function uploadLessonWithRclone({
  lessonDir,
  lessonName = path.basename(lessonDir),
  remote = process.env.RCLONE_REMOTE || DEFAULT_UPLOAD_CONFIG.remote,
  basePath = process.env.RCLONE_BASE_PATH || DEFAULT_UPLOAD_CONFIG.basePath,
  rcloneBin = process.env.RCLONE_BIN || "rclone",
  dryRun = process.env.RCLONE_DRY_RUN === "1",
} = {}) {
  const remotes = await listRemotes({ rcloneBin });
  const remoteName = remote.endsWith(":") ? remote : `${remote}:`;
  if (!remotes.includes(remoteName)) {
    return {
      skipped: true,
      reason: `rclone remote not configured: ${remoteName}`,
      remotePath: null,
    };
  }

  const remotePath = `${remoteName}${joinRemotePath(basePath, lessonName)}`;
  const args = ["copy", lessonDir, remotePath, "--progress"];
  if (dryRun) {
    args.push("--dry-run");
  }

  const { stdout, stderr } = await execFileAsync(rcloneBin, args, {
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });

  return {
    skipped: false,
    dryRun,
    remotePath,
    stdout,
    stderr,
  };
}

export async function checkRcloneRemote({
  remote = process.env.RCLONE_REMOTE || DEFAULT_UPLOAD_CONFIG.remote,
  rcloneBin = process.env.RCLONE_BIN || "rclone",
} = {}) {
  const remotes = await listRemotes({ rcloneBin });
  const remoteName = remote.endsWith(":") ? remote : `${remote}:`;

  return {
    ok: remotes.includes(remoteName),
    remote: remoteName,
    configuredRemotes: remotes,
  };
}

async function listRemotes({ rcloneBin }) {
  try {
    const { stdout } = await execFileAsync(rcloneBin, ["listremotes"], {
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function joinRemotePath(...parts) {
  return parts
    .filter(Boolean)
    .map((part) => String(part).replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}
