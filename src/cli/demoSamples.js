import path from "node:path";
import { copyFileEnsuringDir, ensureDir, listImageFiles, pathExists } from "../utils/files.js";

const CATEGORY_PATTERNS = [
  { route: "reading", pattern: /(?:^|[\\/])(?:read|reading)(?:[\\/]|$)/i },
  { route: "listening", pattern: /(?:^|[\\/])(?:lis|listening)(?:[\\/]|$)/i },
  { route: "speaking", pattern: /(?:^|[\\/])(?:speak|speaking)(?:[\\/]|$)/i },
];

export async function prepareDemoLessonFromSample({
  sampleRoot,
  lessonDir,
  perCategory = 1,
  includeReviewExample = true,
  log = console.log,
}) {
  const resolvedSampleRoot = path.resolve(sampleRoot);
  const resolvedLessonDir = path.resolve(lessonDir);
  if (!(await pathExists(resolvedSampleRoot))) {
    throw new Error(`Sample root does not exist: ${resolvedSampleRoot}`);
  }

  const imageFiles = await listImageFiles(resolvedSampleRoot);
  if (!imageFiles.length) {
    throw new Error(`No sample images found: ${resolvedSampleRoot}`);
  }

  const selected = [];
  for (const { route, pattern } of CATEGORY_PATTERNS) {
    const matches = imageFiles
      .filter((file) => pattern.test(path.relative(resolvedSampleRoot, file)))
      .slice(0, perCategory);

    for (const file of matches) {
      selected.push({ route, file });
    }
  }

  if (includeReviewExample) {
    const reviewCandidate =
      imageFiles.find((file) => !CATEGORY_PATTERNS.some(({ pattern }) => pattern.test(path.relative(resolvedSampleRoot, file)))) ??
      imageFiles[0];
    selected.push({ route: "review-seed", file: reviewCandidate });
  }

  const inputDir = path.join(resolvedLessonDir, "input");
  await ensureDir(inputDir);

  for (const [index, item] of selected.entries()) {
    const extension = path.extname(item.file) || ".jpg";
    const targetName = `${String(index + 1).padStart(2, "0")}-${item.route}${extension.toLowerCase()}`;
    await copyFileEnsuringDir(item.file, path.join(inputDir, targetName));
  }

  log(`Prepared ${selected.length} demo images in ${inputDir}`);
  return {
    lessonDir: resolvedLessonDir,
    inputDir,
    selected,
  };
}
