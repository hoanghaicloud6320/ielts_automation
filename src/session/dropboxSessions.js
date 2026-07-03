import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, pathExists } from "../utils/files.js";

const IGNORE_NAMES = new Set([".gitkeep", ".ds_store", "thumbs.db"]);

export async function createSessionFromDropDir({
  dropDir,
  sessionsRoot,
  cwd = process.cwd(),
  prefix,
}) {
  const resolvedDropDir = path.resolve(cwd, dropDir);
  const resolvedSessionsRoot = path.resolve(cwd, sessionsRoot);

  await ensureDir(resolvedDropDir);
  await ensureDir(resolvedSessionsRoot);

  const hasInput = await directoryHasUserFiles(resolvedDropDir);
  if (!hasInput) {
    throw new Error(`No input files found in: ${resolvedDropDir}`);
  }

  const sessionDir = await uniqueSessionDir(resolvedSessionsRoot, `${prefix}_${timestampSlug()}`);
  await copyUserFiles(resolvedDropDir, sessionDir);

  return {
    dropDir: resolvedDropDir,
    sessionDir,
    sessionName: path.basename(sessionDir),
  };
}

export async function renameSessionFromFetchReport({ sessionDir, report }) {
  const parent = path.dirname(sessionDir);
  const timestamp = path.basename(sessionDir).match(/\d{8}_\d{6}/)?.[0] ?? timestampSlug();
  const contentName = inferFetchSessionName(report);
  const targetDir = await uniqueSessionDir(parent, `${timestamp}__${contentName}`);

  if (path.resolve(sessionDir) === path.resolve(targetDir)) {
    return {
      sessionDir,
      sessionName: path.basename(sessionDir),
    };
  }

  await fs.rename(sessionDir, targetDir);
  return {
    sessionDir: targetDir,
    sessionName: path.basename(targetDir),
  };
}

function inferFetchSessionName(report) {
  const parts = [];
  const groupingResults = report?.unit_grouping?.results ?? [];

  for (const skill of ["reading", "listening", "speaking"]) {
    const group = groupingResults.find((item) => item.skill === skill && !item.skipped);
    const units = Array.isArray(group?.units) ? group.units : [];
    for (const unit of units.slice(0, 3)) {
      const label = unit.title || unit.unit_id || skill;
      parts.push(`${skillShortName(skill)}_${label}`);
    }
  }

  return safeSlug(parts.join("__") || "ielts_session", { maxLength: 140 });
}

async function copyUserFiles(sourceDir, targetDir) {
  await ensureDir(targetDir);
  await fs.cp(sourceDir, targetDir, {
    recursive: true,
    filter: (sourcePath) => !IGNORE_NAMES.has(path.basename(sourcePath).toLowerCase()),
  });
}

async function directoryHasUserFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORE_NAMES.has(entry.name.toLowerCase())) {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isFile()) {
      return true;
    }
    if (entry.isDirectory() && (await directoryHasUserFiles(fullPath))) {
      return true;
    }
  }
  return false;
}

async function uniqueSessionDir(parentDir, name) {
  const base = safeSlug(name, { maxLength: 180 });
  let candidate = path.join(parentDir, base);
  let counter = 2;
  while (await pathExists(candidate)) {
    candidate = path.join(parentDir, `${base}_${counter}`);
    counter += 1;
  }
  return candidate;
}

function timestampSlug(date = new Date()) {
  return date
    .toISOString()
    .slice(0, 19)
    .replace(/[-:]/g, "")
    .replace("T", "_");
}

function skillShortName(skill) {
  if (skill === "reading") return "read";
  if (skill === "listening") return "lis";
  if (skill === "speaking") return "speak";
  return skill;
}

function safeSlug(value, { maxLength } = {}) {
  const slug = String(value || "session")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return (maxLength ? slug.slice(0, maxLength).replace(/_+$/g, "") : slug) || "session";
}
