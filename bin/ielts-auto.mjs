#!/usr/bin/env node
import process from "node:process";
import { createGeminiClient } from "../src/ai/geminiClient.js";
import { classifyImage } from "../src/classifier/imageClassifier.js";
import { parseArgs, numberOption } from "../src/cli/args.js";
import { prepareDemoLessonFromSample } from "../src/cli/demoSamples.js";
import {
  DEFAULT_FETCH_DROP_DIR,
  DEFAULT_SUBMIT_DROP_DIR,
  DEFAULT_UPLOAD_CONFIG,
  defaultFetchSessionsRoot,
  defaultSubmitSessionsRoot,
} from "../src/config/defaults.js";
import { runFetchAnswersPipeline } from "../src/fetch/runFetchAnswersPipeline.js";
import { reorderPages } from "../src/reorder/pageReorderer.js";
import { loadGeminiApiKey } from "../src/secrets/loadGeminiApiKey.js";
import { createSessionFromDropDir, renameSessionFromFetchReport } from "../src/session/dropboxSessions.js";
import { runSubmitPipeline } from "../src/submit/runSubmitPipeline.js";
import { checkRcloneRemote } from "../src/upload/rcloneUploader.js";
import { listImageFiles } from "../src/utils/files.js";

const HELP = `IELTS automation CLI

Usage:
  ielts-auto fetch-lesson
  ielts-auto submit-lesson
  ielts-auto submit <lessonDir> [--skip-upload] [--dry-run] [--remote ielts-drive] [--base-path IELTS/submissions] [--model gemini-3.1-flash-lite] [--min-confidence 0.75]
  ielts-auto fetch-answers <lessonDir> [--extract-answers] [--model gemini-3.1-flash-lite] [--min-confidence 0.75]
  ielts-auto reorder-pages <imageDir> [--skill reading|listening|speaking] [--strategy gemini|filename] [--model gemini-3.1-flash-lite]
  ielts-auto classify <imagePath> [--model gemini-3.1-flash-lite]
  ielts-auto prepare-demo --sample-root build/tmp/sample_data --lesson-dir submit/les_demo [--per-category 1]
  ielts-auto check

Examples:
  npm run fetch
  npm run submit
  node bin/ielts-auto.mjs submit submit/les_1 --dry-run
  node bin/ielts-auto.mjs fetch-answers fetch/les_1
  node bin/ielts-auto.mjs reorder-pages fetch/les_1/organized/reading --skill reading
  node bin/ielts-auto.mjs classify submit/les_1/input/page.jpg
`;

async function main() {
  const { command, positionals, options } = parseArgs(process.argv.slice(2));

  if (!command || command === "help" || options.help) {
    console.log(HELP);
    return;
  }

  if (command === "fetch-lesson") {
    if (positionals[0]) {
      console.log("Note: fetch-lesson no longer needs a lesson number; using the root drop folder.");
    }
    const session = await createSessionFromDropDir({
      dropDir: DEFAULT_FETCH_DROP_DIR,
      sessionsRoot: defaultFetchSessionsRoot(),
      prefix: "fetch",
    });
    console.log(`Session created: ${session.sessionDir}`);

    const result = await runFetchAnswersPipeline({
      lessonDir: session.sessionDir,
      model: options.model,
      minConfidence: numberOption(options.minConfidence, 0.75),
      extractAnswers: true,
    });
    const renamed = await renameSessionFromFetchReport({
      sessionDir: session.sessionDir,
      report: result.report,
    });

    console.log(`Session saved: ${renamed.sessionDir}`);
    console.log(`Answers saved in: ${renamed.sessionDir}/answers`);
    console.log(`Report saved in: ${renamed.sessionDir}/reports`);
    return;
  }

  if (command === "submit-lesson") {
    if (positionals[0]) {
      console.log("Note: submit-lesson no longer needs a lesson number; using the root drop folder.");
    }
    const session = await createSessionFromDropDir({
      dropDir: DEFAULT_SUBMIT_DROP_DIR,
      sessionsRoot: defaultSubmitSessionsRoot(),
      prefix: "submit",
    });
    console.log(`Session created: ${session.sessionDir}`);

    const result = await runSubmitPipeline({
      lessonDir: session.sessionDir,
      model: options.model,
      minConfidence: numberOption(options.minConfidence, 0.75),
      resume: true,
      upload: {
        lessonName: session.sessionName,
        remote: options.remote || DEFAULT_UPLOAD_CONFIG.remote,
        basePath: options.basePath || DEFAULT_UPLOAD_CONFIG.basePath,
        dryRun: Boolean(options.dryRun),
      },
    });

    console.log(`Report saved: ${result.reportPath}`);
    if (result.report.upload?.dryRun) {
      console.log(`Upload dry run target: ${result.report.upload.remotePath}`);
    } else {
      console.log(`Uploaded to: ${result.report.upload?.remotePath ?? "unknown target"}`);
    }
    return;
  }

  if (command === "reorder-pages") {
    const imageDir = positionals[0];
    if (!imageDir) {
      throw new Error("Missing image directory.");
    }
    const imagePaths = await listImageFiles(imageDir);
    const strategy = options.strategy || "gemini";
    const result =
      strategy === "filename"
        ? {
            ordered_files: imagePaths
              .map((imagePath) => imagePath.split(/[\\/]/).at(-1))
              .sort((a, b) => a.localeCompare(b))
              .map((filename, index) => ({
                filename,
                position: index + 1,
                confidence: 1,
                evidence: ["Sorted by filename fallback strategy."],
              })),
            overall_confidence: 1,
            warnings: ["Filename strategy is only a fallback/plumbing test, not visual page reorder."],
          }
        : await reorderWithGemini({ imagePaths, skill: options.skill || "unknown", model: options.model });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "fetch-answers") {
    const lessonDir = positionals[0];
    const result = await runFetchAnswersPipeline({
      lessonDir,
      model: options.model,
      minConfidence: numberOption(options.minConfidence, 0.75),
      extractAnswers: Boolean(options.extractAnswers),
    });

    console.log(`Report saved: ${result.reportPath}`);
    console.log(`Classified pages: ${result.organizedRoot}`);
    console.log(`Unit groups: ${result.unitGroupsRoot}`);
    console.log(`Sorted classified pages: ${result.sortedRoot}`);
    if (result.report.answer_extraction.enabled) {
      console.log(`Answers saved in: ${result.answersDir}`);
      console.log("Reading, speaking, and matching listening units were extracted when source pages/audio were available.");
    } else {
      console.log("Answer extraction skipped. Add --extract-answers when using clean blank source pages.");
    }
    return;
  }

  if (command === "submit") {
    const lessonDir = positionals[0];
    const result = await runSubmitPipeline({
      lessonDir,
      model: options.model,
      minConfidence: numberOption(options.minConfidence, 0.75),
      skipUpload: Boolean(options.skipUpload),
      resume: Boolean(options.resume),
      upload: {
        remote: options.remote || DEFAULT_UPLOAD_CONFIG.remote,
        basePath: options.basePath || DEFAULT_UPLOAD_CONFIG.basePath,
        dryRun: Boolean(options.dryRun),
      },
    });

    console.log(`Report saved: ${result.reportPath}`);
    if (result.report.upload?.skipped) {
      console.log(`Upload skipped: ${result.report.upload.reason}`);
    } else if (result.report.upload?.dryRun) {
      console.log(`Upload dry run target: ${result.report.upload.remotePath}`);
    } else {
      console.log(`Uploaded to: ${result.report.upload.remotePath}`);
    }
    return;
  }

  if (command === "classify") {
    const imagePath = positionals[0];
    if (!imagePath) {
      throw new Error("Missing image path.");
    }
    const apiKey = await loadGeminiApiKey();
    const gemini = createGeminiClient({ apiKey, model: options.model });
    const classification = await classifyImage({ gemini, imagePath });
    console.log(JSON.stringify(classification, null, 2));
    return;
  }

  if (command === "prepare-demo") {
    await prepareDemoLessonFromSample({
      sampleRoot: options.sampleRoot || "build/tmp/sample_data",
      lessonDir: options.lessonDir || "submit/les_demo",
      perCategory: numberOption(options.perCategory, 1),
      includeReviewExample: options.reviewExample !== "false",
    });
    return;
  }

  if (command === "check") {
    const rclone = await checkRcloneRemote({
      remote: options.remote || DEFAULT_UPLOAD_CONFIG.remote,
    });

    console.log(
      JSON.stringify(
        {
          geminiKey: "checked when running classify/submit",
          rclone,
        },
        null,
        2,
      ),
    );
    return;
  }

  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}

async function reorderWithGemini({ imagePaths, skill, model }) {
  const apiKey = await loadGeminiApiKey();
  const gemini = createGeminiClient({ apiKey, model });
  return reorderPages({
    gemini,
    imagePaths,
    skill,
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
