import fs from "node:fs/promises";
import path from "node:path";
import { createGeminiClient } from "../ai/geminiClient.js";
import { classifyImage } from "../classifier/imageClassifier.js";
import { loadGeminiApiKey } from "../secrets/loadGeminiApiKey.js";
import { uploadLessonWithRclone } from "../upload/rcloneUploader.js";
import { copyFileEnsuringDir, ensureDir, listImageFiles, pathExists } from "../utils/files.js";
import { routeClassification } from "./routeClassification.js";

export async function runSubmitPipeline({
  lessonDir,
  cwd = process.cwd(),
  model,
  minConfidence = 0.75,
  skipUpload = false,
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

  const apiKey = await loadGeminiApiKey({ cwd });
  const gemini = createGeminiClient({ apiKey, model });
  const imageFiles = await listImageFiles(resolvedLessonDir);

  if (!imageFiles.length) {
    throw new Error(`No images found in lesson folder: ${resolvedLessonDir}`);
  }

  const classifiedRoot = path.join(resolvedLessonDir, "classified");
  const reportsDir = path.join(resolvedLessonDir, "reports");
  await fs.rm(classifiedRoot, { recursive: true, force: true });
  await ensureDir(reportsDir);

  const results = [];

  for (const imagePath of imageFiles) {
    const relativePath = path.relative(resolvedLessonDir, imagePath);
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
  }

  const report = {
    lesson: path.basename(resolvedLessonDir),
    model: gemini.model,
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
