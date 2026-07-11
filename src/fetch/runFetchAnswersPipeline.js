import fs from "node:fs/promises";
import path from "node:path";
import { createPartFromUri } from "@google/genai";
import { createGeminiClient } from "../ai/geminiClient.js";
import { extractAnswersForUnit } from "../answers/extractAnswers.js";
import { classifyImagesBatch } from "../classifier/imageClassifier.js";
import { extractListeningAnswersFromTranscriptOcr, formatListeningAlignmentAnswers } from "../listening/listeningAlignment.js";
import {
  scanListeningWorksheetDocument,
  transcribeListeningAudio,
} from "../listening/listeningExtractor.js";
import { loadGeminiApiKeys } from "../secrets/loadGeminiApiKey.js";
import { inventorySkillPages } from "../units/pageInventory.js";
import { sortAndGroupSkillPagesFromInventory } from "../units/skillSortGrouper.js";
import { copyFileEnsuringDir, ensureDir, listImageFiles, pathExists } from "../utils/files.js";

const SKILL_LABELS = new Set(["reading", "listening", "speaking"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"]);

export async function runFetchAnswersPipeline({
  lessonDir,
  cwd = process.cwd(),
  model,
  minConfidence = 0.75,
  extractAnswers = false,
  log = console.log,
} = {}) {
  if (!lessonDir) {
    throw new Error("Missing lesson folder.");
  }

  const resolvedLessonDir = path.resolve(cwd, lessonDir);
  if (!(await pathExists(resolvedLessonDir))) {
    throw new Error(`Lesson folder does not exist: ${resolvedLessonDir}`);
  }

  log("WARNING: fetch-answers expects blank/original worksheet photos taken before the student writes answers.");
  log("If the photos already contain handwriting, extracted answers may be contaminated.");
  log("Photo tips: keep text sharp, avoid glare/tilt, include full passage/questions, and include page/unit numbers when possible.");
  log("Cross-unit photos are OK; the same image can be assigned to multiple units when needed.");

  const apiKeys = await loadGeminiApiKeys({ cwd });
  const gemini = createGeminiClient({ apiKeys, model });
  const imageFiles = await listImageFiles(resolvedLessonDir);
  const audioFiles = await listAudioFiles(resolvedLessonDir);

  if (!imageFiles.length) {
    throw new Error(`No images found in lesson folder: ${resolvedLessonDir}`);
  }

  const organizedRoot = path.join(resolvedLessonDir, "organized");
  const unitGroupsRoot = path.join(resolvedLessonDir, "unit_groups");
  const sortedRoot = path.join(resolvedLessonDir, "sorted_classified");
  const reportsDir = path.join(resolvedLessonDir, "reports");
  const answersDir = path.join(resolvedLessonDir, "answers");
  await fs.rm(organizedRoot, { recursive: true, force: true });
  await fs.rm(unitGroupsRoot, { recursive: true, force: true });
  await fs.rm(sortedRoot, { recursive: true, force: true });
  await ensureDir(reportsDir);
  await ensureDir(answersDir);

  const results = [];
  const grouped = {
    reading: [],
    listening: [],
    speaking: [],
    review: [],
  };

  log(`Classifying ${imageFiles.length} images as one batch...`);
  const batchClassification = await classifyImagesBatch({ gemini, imagePaths: imageFiles });
  const bySourceFilename = new Map(imageFiles.map((imagePath) => [path.basename(imagePath), imagePath]));

  for (const item of batchClassification.results) {
    const imagePath = bySourceFilename.get(item.filename);
    if (!imagePath) {
      continue;
    }
    const relativePath = path.relative(resolvedLessonDir, imagePath);
    const classification = item.classification;
    const route = routeFetchClassification(classification, { minConfidence });
    const targetPath = path.join(organizedRoot, route, path.basename(imagePath));
    await copyFileEnsuringDir(imagePath, targetPath);
    grouped[route].push(targetPath);

    const warnings = [];
    if (classification.is_completed_by_student) {
      warnings.push("Image appears completed by student; fetch-answer accuracy may be contaminated.");
    }
    if (classification.is_answer_key_or_checked) {
      warnings.push("Image appears checked/corrected; do not use it as a blank source.");
    }

    results.push({
      source: relativePath,
      routed_to: path.relative(resolvedLessonDir, targetPath),
      classification,
      warnings,
    });

    log(`  ${relativePath} -> ${route} (${classification.primary_label}, confidence ${classification.confidence})`);
  }

  const unitGroupingResults = [];
  const reorderResults = [];
  const sortedGrouped = {
    reading: [],
    listening: [],
    speaking: [],
    review: [],
  };
  const sortedUnits = {
    reading: [],
    listening: [],
    speaking: [],
  };

  for (const skill of ["reading", "listening", "speaking"]) {
    const skillImages = grouped[skill].sort((a, b) => a.localeCompare(b));
    if (!skillImages.length) {
      unitGroupingResults.push({
        skill,
        skipped: true,
        reason: "No images for skill.",
      });
      reorderResults.push({
        skill,
        skipped: true,
        reason: "No images for skill.",
      });
      continue;
    }

    log(`Inventoring all ${skill} pages...`);
    const inventories = await inventorySkillPages({ gemini, imagePaths: skillImages, skill, log });
    log(`Sorting and grouping all ${skill} pages from inventory...`);
    const sortGroup = await sortAndGroupSkillPagesFromInventory({
      gemini,
      imagePaths: skillImages,
      inventories,
      skill,
    });
    const byFilename = new Map(skillImages.map((imagePath) => [path.basename(imagePath), imagePath]));

    const copiedUnits = [];
    for (const unit of sortGroup.units) {
      const unitFiles = [];
      for (const file of unit.files) {
        const sourcePath = byFilename.get(file.filename);
        if (!sourcePath) {
          continue;
        }
        const targetPath = path.join(unitGroupsRoot, skill, unit.unit_id, file.filename);
        await copyFileEnsuringDir(sourcePath, targetPath);
        unitFiles.push(targetPath);
      }

      copiedUnits.push({
        ...unit,
        imagePaths: unitFiles,
      });
    }

    unitGroupingResults.push({
      skill,
      skipped: false,
      strategy: "page_inventory_then_skill_sort_group",
      page_inventory: inventories,
      global_order: sortGroup.global_order,
      units: sortGroup.units,
      warnings: sortGroup.warnings,
    });

    for (const unit of copiedUnits) {
      if (!unit.imagePaths.length) {
        reorderResults.push({
          skill,
          unit_id: unit.unit_id,
          skipped: true,
          reason: "No copied images for unit.",
        });
        continue;
      }

      const unitByFilename = new Map(unit.imagePaths.map((imagePath) => [path.basename(imagePath), imagePath]));
      const sortedFiles = [];

      for (const item of unit.files) {
        const sourcePath = unitByFilename.get(item.filename);
        if (!sourcePath) {
          continue;
        }
        const targetName = `${String(item.position).padStart(3, "0")}-${item.filename}`;
        const targetPath = path.join(sortedRoot, skill, unit.unit_id, targetName);
        await copyFileEnsuringDir(sourcePath, targetPath);
        sortedFiles.push(targetPath);
      }

      sortedGrouped[skill].push(...sortedFiles);
      sortedUnits[skill].push({
        skill,
        unit_id: unit.unit_id,
        title: unit.title,
        imagePaths: sortedFiles,
        source_files: unit.files,
      });
      reorderResults.push({
        skill,
        unit_id: unit.unit_id,
        unit_title: unit.title,
        skipped: false,
        strategy: "derived_from_skill_sort_group",
        ordered_files: unit.files,
        overall_confidence: unit.confidence,
        warnings: unit.warnings,
      });
    }
  }

  for (const [index, reviewPath] of grouped.review.sort((a, b) => a.localeCompare(b)).entries()) {
    const targetPath = path.join(
      sortedRoot,
      "review",
      `${String(index + 1).padStart(3, "0")}-${path.basename(reviewPath)}`,
    );
    await copyFileEnsuringDir(reviewPath, targetPath);
    sortedGrouped.review.push(targetPath);
  }

  const answerResults = [];
  if (extractAnswers) {
    for (const skill of ["reading", "speaking"]) {
      const combinedAnswers = [];

      for (const unit of sortedUnits[skill]) {
        log(`Extracting answers for ${skill}/${unit.unit_id}...`);
        const answer = await extractAnswersForUnit({
          gemini,
          skill,
          unit,
          imagePaths: unit.imagePaths,
          log,
        });
        answerResults.push(answer);

        const unitAnswersDir = path.join(answersDir, skill);
        await ensureDir(unitAnswersDir);
        const answerText = answer.text || `No answers extracted for ${skill}/${unit.unit_id}.\n`;
        await fs.writeFile(path.join(unitAnswersDir, `${safeFileName(unit.unit_id)}.md`), answerText);

        combinedAnswers.push([
          `# ${skill}/${unit.unit_id}`,
          unit.title ? `\nTitle: ${unit.title}\n` : "",
          answerText,
        ].join("\n"));
      }

      if (combinedAnswers.length) {
        await fs.writeFile(path.join(answersDir, `${skill}.md`), `${combinedAnswers.join("\n\n---\n\n")}\n`);
      }
    }

    const listeningAnswers = [];
    for (const unit of sortedUnits.listening) {
      log(`Extracting listening answers for ${unit.unit_id}...`);
      const answer = await extractListeningUnit({
        gemini,
        unit,
        audioFiles,
        answersDir,
        log,
      });
      answerResults.push(answer);
      if (!answer.skipped && answer.text) {
        listeningAnswers.push([
          `# listening/${unit.unit_id}`,
          unit.title ? `\nTitle: ${unit.title}\n` : "",
          answer.text,
        ].join("\n"));
      }
    }

    if (listeningAnswers.length) {
      await fs.writeFile(path.join(answersDir, "listening.md"), `${listeningAnswers.join("\n\n---\n\n")}\n`);
    }
  }

  const report = {
    lesson: path.basename(resolvedLessonDir),
    model: gemini.model,
    created_at: new Date().toISOString(),
    warning:
      "Use only blank/original worksheet photos for fetch-answers. Completed or corrected pages can contaminate extraction.",
    classified_count: results.length,
    min_confidence: minConfidence,
    batch_classification_warnings: batchClassification.warnings,
    results,
    unit_grouping: {
      enabled: true,
      results: unitGroupingResults,
    },
    reorder: {
      enabled: true,
      results: reorderResults,
    },
    answer_extraction: {
      enabled: extractAnswers,
      results: answerResults,
    },
  };

  const reportPath = path.join(
    reportsDir,
    `fetch-answers-report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  return {
    lessonDir: resolvedLessonDir,
    organizedRoot,
    unitGroupsRoot,
    sortedRoot,
    answersDir,
    reportPath,
    report,
  };
}

async function extractListeningUnit({ gemini, unit, audioFiles, answersDir, log }) {
  const audioPath = matchListeningAudio(unit, audioFiles);
  if (!audioPath) {
    return {
      skill: "listening",
      unit_id: unit.unit_id,
      title: unit.title,
      skipped: true,
      reason: "No matching audio file found for listening unit.",
      text: "",
    };
  }

  const unitId = safeFileName(unit.unit_id);
  const listeningDir = path.join(answersDir, "listening", unitId);
  await ensureDir(listeningDir);

  const audioName = unit.title || unit.unit_id || path.basename(audioPath, path.extname(audioPath));
  log(`Uploading listening audio ${path.basename(audioPath)}...`);
  const uploadedAudio = await gemini.ai.files.upload({
    file: audioPath,
    config: {
      mimeType: mimeTypeForAudio(audioPath),
      displayName: audioName,
    },
  });

  log(`Transcribing listening/${unit.unit_id}...`);
  const transcript = await transcribeListeningAudio({
    gemini,
    audioName,
    audioPart: createPartFromUri(uploadedAudio.uri, uploadedAudio.mimeType ?? mimeTypeForAudio(audioPath)),
    log,
  });
  await fs.writeFile(path.join(listeningDir, "transcript.txt"), transcript);

  const worksheetImages = uniqueImagePathsByOriginalName(unit.imagePaths);

  log(`OCR scanning listening worksheet images for ${unit.unit_id}...`);
  const ocrDocument = await scanListeningWorksheetDocument({
    gemini,
    audioName,
    imagePaths: worksheetImages,
    log,
  });
  await fs.writeFile(path.join(listeningDir, "worksheet_ocr.md"), ocrDocument);

  log(`Extracting listening answers from transcript/OCR text gaps for ${unit.unit_id}...`);
  const alignment = extractListeningAnswersFromTranscriptOcr({
    audioName,
    transcript,
    ocrDocument,
  });
  const alignmentText = formatListeningAlignmentAnswers(alignment);
  await fs.writeFile(path.join(listeningDir, "ocr_transcript_text_gaps.json"), JSON.stringify(alignment, null, 2));
  await fs.writeFile(path.join(listeningDir, "answers.md"), alignmentText);

  return {
    skill: "listening",
    unit_id: unit.unit_id,
    title: unit.title,
    skipped: false,
    audio: path.basename(audioPath),
    transcript_path: path.join("listening", unitId, "transcript.txt"),
    worksheet_ocr_path: path.join("listening", unitId, "worksheet_ocr.md"),
    alignment_path: path.join("listening", unitId, "ocr_transcript_text_gaps.json"),
    text: alignmentText,
  };
}

function uniqueImagePathsByOriginalName(imagePaths) {
  const seen = new Set();
  const unique = [];
  for (const imagePath of imagePaths) {
    const originalName = path.basename(imagePath).replace(/^\d+-/, "");
    if (seen.has(originalName)) {
      continue;
    }
    seen.add(originalName);
    unique.push(imagePath);
  }
  return unique;
}

function matchListeningAudio(unit, audioFiles) {
  if (!audioFiles.length) {
    return null;
  }

  const unitText = `${unit.unit_id ?? ""} ${unit.title ?? ""}`.toLowerCase();
  const unitNumbers = extractNumbers(unitText);
  for (const unitNumber of unitNumbers) {
    const byNumber = audioFiles.find((audioPath) => {
      const audioNumbers = extractNumbers(path.basename(audioPath).toLowerCase());
      return audioNumbers.includes(unitNumber);
    });
    if (byNumber) {
      return byNumber;
    }
  }

  if (audioFiles.length === 1) {
    return audioFiles[0];
  }

  const unitTokens = new Set(unitText.split(/[^a-z0-9]+/).filter(Boolean));
  return (
    audioFiles.find((audioPath) => {
      const audioTokens = path.basename(audioPath).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      return audioTokens.some((token) => unitTokens.has(token));
    }) ?? null
  );
}

function extractNumbers(value) {
  return (String(value).match(/\d+/g) ?? []).map((number) => String(Number(number)));
}

async function listAudioFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (["answers", "classified", "organized", "reports", "sorted_classified", "unit_groups"].includes(entry.name.toLowerCase())) {
        continue;
      }
      files.push(...(await listAudioFiles(fullPath)));
    } else if (entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function mimeTypeForAudio(audioPath) {
  const lower = audioPath.toLowerCase();
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".aac")) return "audio/aac";
  if (lower.endsWith(".flac")) return "audio/flac";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  return "audio/mpeg";
}

function safeFileName(value) {
  return String(value || "unit")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

function routeFetchClassification(classification, { minConfidence }) {
  if (
    SKILL_LABELS.has(classification.primary_label) &&
    classification.confidence >= minConfidence &&
    !classification.should_route_to_review
  ) {
    return classification.primary_label;
  }

  return "review";
}
