import fs from "node:fs/promises";
import path from "node:path";
import { createGeminiClient } from "../ai/geminiClient.js";
import { classifyImage } from "../classifier/imageClassifier.js";
import { loadGeminiApiKeys } from "../secrets/loadGeminiApiKey.js";
import { uploadLessonWithRclone } from "../upload/rcloneUploader.js";
import { copyFileEnsuringDir, ensureDir, listImageFiles, pathExists } from "../utils/files.js";
import { routeClassification } from "./routeClassification.js";

export async function runSubmitPipeline({
  lessonDir,
  cwd = process.cwd(),
  model,
  minConfidence = 0.75,
  skipUpload = false,
  resume = false,
  upload = {},
  log = console.log,
} = {}) {
  if (!lessonDir) {
    throw new Error("Missing lesson folder.");
  }

  const resolvedLessonDir = path.resolve(cwd, lessonDir);
  if (!(await pathExists(resolvedLessonDir))) {
    throw new Error(`Lesson folder does not exist: ${resolvedLessonDir}`);
  }

  const apiKeys = await loadGeminiApiKeys({ cwd });
  const gemini = createGeminiClient({ apiKeys, model });
  const imageFiles = await listImageFiles(resolvedLessonDir);

  if (!imageFiles.length) {
    throw new Error(`No images found in lesson folder: ${resolvedLessonDir}`);
  }

  const classifiedRoot = path.join(resolvedLessonDir, "classified");
  const reportsDir = path.join(resolvedLessonDir, "reports");
  await ensureDir(reportsDir);
  const progressPath = path.join(reportsDir, "submit-progress.json");

  let results = [];
  let startedAt = new Date().toISOString();

  if (resume) {
    const progress = await readProgress(progressPath);
    if (progress) {
      results = Array.isArray(progress.results) ? progress.results : [];
      startedAt = progress.started_at ?? startedAt;
      log(`Resuming from ${results.length}/${imageFiles.length} classified images.`);
    }
  } else {
    await fs.rm(classifiedRoot, { recursive: true, force: true });
  }

  const doneSources = new Set(results.map((result) => normalizeRelativePath(result.source)));

  for (const imagePath of imageFiles) {
    const relativePath = path.relative(resolvedLessonDir, imagePath);
    if (doneSources.has(normalizeRelativePath(relativePath))) {
      continue;
    }

    log(`Classifying ${relativePath}...`);

    const classification = await classifyImage({ gemini, imagePath });
    const route = routeClassification(classification, { minConfidence });
    const targetPath = path.join(classifiedRoot, route, path.basename(imagePath));
    await copyFileEnsuringDir(imagePath, targetPath);

    results.push({
      source: relativePath,
      routed_to: path.relative(resolvedLessonDir, targetPath),
      classification,
    });

    log(`  -> ${route} (${classification.primary_label}, confidence ${classification.confidence})`);

    await fs.writeFile(
      progressPath,
      JSON.stringify(
        {
          lesson: path.basename(resolvedLessonDir),
          model: gemini.model,
          started_at: startedAt,
          updated_at: new Date().toISOString(),
          classified_count: results.length,
          total_count: imageFiles.length,
          min_confidence: minConfidence,
          results,
        },
        null,
        2,
      ),
    );
  }

  const report = {
    lesson: path.basename(resolvedLessonDir),
    model: gemini.model,
    started_at: startedAt,
    created_at: new Date().toISOString(),
    classified_count: results.length,
    min_confidence: minConfidence,
    results,
    upload: null,
  };

  if (skipUpload) {
    report.upload = { skipped: true, reason: "skipUpload=true" };
  } else {
    report.upload = await uploadLessonWithRclone({
      lessonDir: classifiedRoot,
      lessonName: path.basename(resolvedLessonDir),
      ...upload,
    });
  }

  const reportPath = path.join(
    reportsDir,
    `submit-report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  return {
    lessonDir: resolvedLessonDir,
    classifiedRoot,
    reportPath,
    report,
  };
}

async function readProgress(progressPath) {
  try {
    return JSON.parse(await fs.readFile(progressPath, "utf8"));
  } catch {
    return null;
  }
}

function normalizeRelativePath(filePath) {
  return filePath.replaceAll("/", "\\").toLowerCase();
}
