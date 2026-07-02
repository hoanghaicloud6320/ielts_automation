#!/usr/bin/env node
import process from "node:process";
import { createGeminiClient } from "../src/ai/geminiClient.js";
import { classifyImage } from "../src/classifier/imageClassifier.js";
import { parseArgs, numberOption } from "../src/cli/args.js";
import { prepareDemoLessonFromSample } from "../src/cli/demoSamples.js";
import { DEFAULT_UPLOAD_CONFIG } from "../src/config/defaults.js";
import { loadGeminiApiKey } from "../src/secrets/loadGeminiApiKey.js";
import { runSubmitPipeline } from "../src/submit/runSubmitPipeline.js";
import { checkRcloneRemote } from "../src/upload/rcloneUploader.js";

const HELP = `IELTS automation CLI

Usage:
  ielts-auto submit <lessonDir> [--skip-upload] [--dry-run] [--remote ielts-drive] [--base-path IELTS/submissions] [--model gemini-3.1-flash-lite] [--min-confidence 0.75]
  ielts-auto classify <imagePath> [--model gemini-3.1-flash-lite]
  ielts-auto prepare-demo --sample-root build/tmp/sample_data --lesson-dir submit/les_demo [--per-category 1]
  ielts-auto check

Examples:
  npm run submit -- submit/les_1
  node bin/ielts-auto.mjs submit submit/les_1 --dry-run
  node bin/ielts-auto.mjs classify submit/les_1/input/page.jpg
`;

async function main() {
  const { command, positionals, options } = parseArgs(process.argv.slice(2));

  if (!command || command === "help" || options.help) {
    console.log(HELP);
    return;
  }

  if (command === "submit") {
    const lessonDir = positionals[0];
    const result = await runSubmitPipeline({
      lessonDir,
      model: options.model,
      minConfidence: numberOption(options.minConfidence, 0.75),
      skipUpload: Boolean(options.skipUpload),
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

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
