import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createGeminiClient } from "../src/ai/geminiClient.js";
import { generateContentWithRetry } from "../src/ai/generateWithRetry.js";
import { loadGeminiApiKeys } from "../src/secrets/loadGeminiApiKey.js";

const DEFAULT_SESSION =
  "user_data/fetch_sessions/20260707_135055_read_reading_passage_3_-_information_theory_read_test_4_reading_passage";

const args = parseArgs(process.argv.slice(2));
const sessionDir = path.resolve(args.session ?? DEFAULT_SESSION);
const unit = args.unit ?? "audio_22";
const outputDir = path.resolve(args.out ?? "build/tmp/listening_mask_test");
const model = args.model;

const answersUnitDir = path.join(sessionDir, "answers", "listening", unit);
const imagesUnitDir = path.join(sessionDir, "sorted_classified", "listening", unit);

const transcript = await fs.readFile(path.join(answersUnitDir, "transcript.txt"), "utf8");
const worksheetOcr = await fs.readFile(path.join(answersUnitDir, "worksheet_ocr.md"), "utf8");
let imagePaths = await listImageFiles(imagesUnitDir);

if (!imagePaths.length) {
  throw new Error(`No worksheet images found: ${imagesUnitDir}`);
}
if (args.imageIndex) {
  const imageIndex = Number(args.imageIndex);
  if (!Number.isInteger(imageIndex) || imageIndex < 1 || imageIndex > imagePaths.length) {
    throw new Error(`--imageIndex must be between 1 and ${imagePaths.length}`);
  }
  imagePaths = [imagePaths[imageIndex - 1]];
}

await fs.mkdir(outputDir, { recursive: true });

const apiKeys = await loadGeminiApiKeys();
const gemini = createGeminiClient({ apiKeys, model });
const parts = [
  {
    text: transcriptMaskPrompt({
      unit,
      transcript,
      worksheetOcr,
      imageCount: imagePaths.length,
    }),
  },
];
await addImages(parts, imagePaths);

const response = await generateContentWithRetry({
  ai: gemini.ai,
  log: console.log,
  params: {
    model: gemini.model,
    contents: [{ role: "user", parts }],
    config: {
      temperature: 0,
      responseMimeType: "application/json",
    },
  },
});

const rawText = response.text ?? "";
const suffix = args.imageIndex ? `image-${args.imageIndex}` : "all-images";
const resultPath = path.join(outputDir, `${unit}-transcript-mask-${suffix}.json`);
const mdPath = path.join(outputDir, `${unit}-transcript-mask-${suffix}.md`);
await fs.writeFile(resultPath, rawText);

let parsed = null;
try {
  parsed = JSON.parse(rawText);
} catch {
  parsed = null;
}
await fs.writeFile(mdPath, formatResultMarkdown({ unit, parsed, rawText }));

console.log(`Wrote ${resultPath}`);
console.log(`Wrote ${mdPath}`);
console.log(`Accepted answers: ${parsed?.answers?.length ?? "unknown"}`);
console.log(`Suspect candidates: ${parsed?.suspect_candidates?.length ?? "unknown"}`);

function transcriptMaskPrompt({ unit, transcript, worksheetOcr, imageCount }) {
  return `You are testing a candidate IELTS listening extraction method.

Goal:
- Compare the supplied worksheet photos with the transcript.
- Identify phrases that are spoken in the transcript but NOT printed on the worksheet.
- These missing transcript phrases are the answer candidates.
- The supplied image set has ${imageCount} image(s). Return candidates only for the supplied image(s), not for unseen pages.

Critical rule:
- Do NOT use dotted lines, underlines, blue marker numbers, or blank counts as evidence.
- Dots and markers are unreliable. Ignore them except as ordinary visual clutter.
- Only decide from printed text visibility: is the candidate phrase printed on the worksheet page or absent from the printed worksheet text?

Method:
1. Read the worksheet photos directly.
2. Use the OCR document only as rough support, not as truth.
3. Walk through the transcript in order and align it with visible printed worksheet wording.
4. Whenever transcript wording is absent from the worksheet but the surrounding before/after wording is visible, output that absent phrase as an answer.
5. If a phrase may simply be OCR-missed but is visibly printed in the photo, reject it.
6. If you cannot verify from the photo, put it under suspect_candidates, not answers.
7. Do not stop after finding only a few examples. Scan the full supplied image(s), top-to-bottom and left-to-right.

Return strict JSON only:
{
  "unit": "${unit}",
  "method": "transcript_mask_vision_test",
  "answers": [
    {
      "number": 1,
      "answer": "missing transcript phrase",
      "before_visible_text": "printed text immediately before",
      "after_visible_text": "printed text immediately after",
      "photo_evidence": "why the phrase is absent from printed worksheet text",
      "confidence": 0.0
    }
  ],
  "suspect_candidates": [
    {
      "candidate": "phrase",
      "reason": "visible in photo / unclear / weak surrounding anchors"
    }
  ],
  "warnings": []
}

Transcript:
${transcript}

OCR support document:
${worksheetOcr}`;
}

async function addImages(parts, imagePaths) {
  for (const imagePath of imagePaths) {
    const bytes = await fs.readFile(imagePath);
    parts.push({ text: `\nWorksheet image: ${path.basename(imagePath)}` });
    parts.push({
      inlineData: {
        mimeType: mimeTypeForImage(imagePath),
        data: bytes.toString("base64"),
      },
    });
  }
}

function formatResultMarkdown({ unit, parsed, rawText }) {
  if (!parsed) {
    return `# ${unit}\n\nCould not parse JSON response.\n\n\`\`\`json\n${rawText}\n\`\`\`\n`;
  }

  const lines = [`# ${unit}`, "", `Method: ${parsed.method ?? "unknown"}`, ""];
  const answers = Array.isArray(parsed.answers) ? parsed.answers : [];
  for (let index = 0; index < answers.length; index += 5) {
    lines.push(`### BLOCK ${Math.floor(index / 5) + 1}`);
    lines.push("");
    const block = answers.slice(index, index + 5);
    const signature = block[0]?.before_visible_text || block[0]?.after_visible_text || "unclear";
    lines.push(`* **Signature:** \`${String(signature).replace(/\s+/g, " ").trim()}\``);
    for (const answer of block) {
      lines.push(`* **${answer.number ?? index + 1}.** ${answer.answer ?? "unclear"}`);
    }
    lines.push("");
  }

  const suspects = Array.isArray(parsed.suspect_candidates) ? parsed.suspect_candidates : [];
  if (suspects.length) {
    lines.push("### Suspect Candidates");
    lines.push("");
    for (const suspect of suspects) {
      lines.push(`* ${suspect.candidate ?? "unknown"} - ${suspect.reason ?? ""}`);
    }
    lines.push("");
  }

  const warnings = Array.isArray(parsed.warnings) ? parsed.warnings : [];
  if (warnings.length) {
    lines.push("### Warnings");
    lines.push("");
    for (const warning of warnings) {
      lines.push(`* ${warning}`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

async function listImageFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.(jpe?g|png|webp)$/i.test(entry.name))
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

function mimeTypeForImage(imagePath) {
  const extension = path.extname(imagePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2);
    parsed[key] = argv[index + 1];
    index += 1;
  }
  return parsed;
}
