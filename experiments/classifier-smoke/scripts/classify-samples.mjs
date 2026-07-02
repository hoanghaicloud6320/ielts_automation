import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { GoogleGenAI } from "@google/genai";

const repoRoot = path.resolve(process.cwd(), "../..");
const keyPath = path.join(repoRoot, "gemini-api-key.txt");
const sampleRoot = path.join(repoRoot, "build", "tmp", "sample_data");
const outputDir = path.join(process.cwd(), "results");
const model = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
const requestedSampleIds = new Set(
  (process.env.SAMPLE_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
);

const samples = [
  {
    id: "reading_comprehension",
    expected_primary_label: "reading",
    expected_completed_by_student: true,
    expected_checked_or_corrected: false,
    file: "Lesson 1/Read/z7470438414324_f95b74bd799473341e5255956da07c07.jpg",
  },
  {
    id: "reading_article_unit",
    expected_primary_label: "reading",
    expected_completed_by_student: true,
    expected_checked_or_corrected: false,
    file: "les11/read/20260320_120702.jpg",
  },
  {
    id: "listening_audio_dialogue",
    expected_primary_label: "listening",
    expected_completed_by_student: true,
    expected_checked_or_corrected: false,
    file: "Lesson 5/Listening/z7554148142004_b53554ee71de1afd17b6a6878a0d2b78.jpg",
  },
  {
    id: "listening_rotated_dialogue",
    expected_primary_label: "listening",
    expected_completed_by_student: true,
    expected_checked_or_corrected: false,
    file: "les10/lis/20260313_132232.jpg",
  },
  {
    id: "speaking_talk_about_appearance",
    expected_primary_label: "speaking",
    expected_completed_by_student: true,
    expected_checked_or_corrected: false,
    file: "Lesson 1/Speak/z7470438429089_16b1ed61db932f6878012413bfd86ca0.jpg",
  },
  {
    id: "speaking_personal_prompts",
    expected_primary_label: "speaking",
    expected_completed_by_student: true,
    expected_checked_or_corrected: false,
    file: "Lesson 5/Speaking/z7554147311873_8e644b7909993a96601d3ca94c377289.jpg",
  },
  {
    id: "checked_key_page",
    expected_primary_label: "unknown_or_needs_review",
    expected_completed_by_student: true,
    expected_checked_or_corrected: true,
    file: "Lesson 3/Check key/z7497338444766_8b7b13aa104a50740b545f3bccb32348.jpg",
  },
  {
    id: "handwritten_notes_root",
    expected_primary_label: "writing_or_notes",
    expected_completed_by_student: true,
    expected_checked_or_corrected: false,
    file: "les9/20260309_184626.jpg",
  },
];

const prompt = `You classify IELTS/student worksheet photos.

Return only valid JSON, no markdown.

Allowed primary labels:
- reading
- listening
- speaking
- writing_or_notes
- unknown_or_needs_review

Important rules:
- Classify by the visible image content, not by file path or folder name.
- Mentally rotate the page if needed.
- Reading: reading comprehension, passages/articles, "according to the reading/passage", pre-reading questions, vocabulary preview tied to a passage.
- Listening: audio/track markers, transcript/dialogue with blanks, listen-and-complete tasks.
- Speaking: personal prompts, "I can talk about...", "I can describe...", "ABOUT YOU", ask another student/partner, prompts intended for spoken answers.
- writing_or_notes: mostly handwritten notebook notes, essay planning, grammar notes, or feedback without printed worksheet structure.
- Checked/corrected work is not a primary label. Use flags for it.
- If a page is mostly a correction/key/check page and the underlying skill is mixed or unclear, set primary_label to unknown_or_needs_review and is_answer_key_or_checked to true.
- If unclear, choose unknown_or_needs_review instead of forcing a main skill.

JSON schema:
{
  "primary_label": "reading | listening | speaking | writing_or_notes | unknown_or_needs_review",
  "confidence": 0.0,
  "orientation": "upright | rotate_90_clockwise | rotate_180 | rotate_90_counterclockwise | unknown",
  "is_completed_by_student": false,
  "is_answer_key_or_checked": false,
  "evidence": ["short reasons"],
  "warnings": ["ambiguity or contamination notes"],
  "should_route_to_review": false
}`;

async function fileToPart(filePath) {
  const bytes = await fs.readFile(filePath);
  return {
    inlineData: {
      mimeType: "image/jpeg",
      data: bytes.toString("base64"),
    },
  };
}

function parseJson(text) {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(trimmed);
}

async function main() {
  const apiKey = (await fs.readFile(keyPath, "utf8")).trim();
  if (!apiKey) {
    throw new Error(`No API key found at ${keyPath}`);
  }

  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `classifier-results-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

  const ai = new GoogleGenAI({ apiKey });
  const results = [];
  const selectedSamples = requestedSampleIds.size
    ? samples.filter((sample) => requestedSampleIds.has(sample.id))
    : samples;

  async function saveResults(status = "complete", error = null) {
    const passed = results.filter((result) => result.pass).length;
    const primaryPassed = results.filter((result) => result.primaryPass).length;
    const completedPassed = results.filter((result) => result.completedPass).length;
    const checkedPassed = results.filter((result) => result.checkedPass).length;
    await fs.writeFile(
      outputPath,
      JSON.stringify(
        {
          model,
          status,
          error,
          passed,
          primaryPassed,
          completedPassed,
          checkedPassed,
          completed: results.length,
          total: selectedSamples.length,
          selectedSampleIds: selectedSamples.map((sample) => sample.id),
          results,
        },
        null,
        2,
      ),
    );
    return { passed, primaryPassed, completedPassed, checkedPassed };
  }

  for (const sample of selectedSamples) {
    const absolutePath = path.join(sampleRoot, sample.file);
    const imagePart = await fileToPart(absolutePath);
    let response;
    try {
      response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }, imagePart],
          },
        ],
        config: {
          temperature: 0,
          responseMimeType: "application/json",
        },
      });
    } catch (error) {
      await saveResults("partial_error", {
        sampleId: sample.id,
        message: error.message,
      });
      throw error;
    }

    const raw = response.text ?? "";
    const parsed = parseJson(raw);
    const primaryPass = parsed.primary_label === sample.expected_primary_label;
    const completedPass = parsed.is_completed_by_student === sample.expected_completed_by_student;
    const checkedPass = parsed.is_answer_key_or_checked === sample.expected_checked_or_corrected;
    const pass = primaryPass && completedPass && checkedPass;
    results.push({
      id: sample.id,
      expected_primary_label: sample.expected_primary_label,
      predicted_primary_label: parsed.primary_label,
      expected_checked_or_corrected: sample.expected_checked_or_corrected,
      predicted_checked_or_corrected: parsed.is_answer_key_or_checked,
      expected_completed_by_student: sample.expected_completed_by_student,
      predicted_completed_by_student: parsed.is_completed_by_student,
      pass,
      primaryPass,
      completedPass,
      checkedPass,
      confidence: parsed.confidence,
      orientation: parsed.orientation,
      is_completed_by_student: parsed.is_completed_by_student,
      should_route_to_review: parsed.should_route_to_review,
      evidence: parsed.evidence,
      warnings: parsed.warnings,
      file: sample.file,
    });

    console.log(
      `${pass ? "PASS" : "FAIL"} ${sample.id}: expected=${sample.expected_primary_label}/checked:${sample.expected_checked_or_corrected}, predicted=${parsed.primary_label}/checked:${parsed.is_answer_key_or_checked}, confidence=${parsed.confidence}`,
    );
    await saveResults("partial");
  }

  const { passed, primaryPassed, completedPassed, checkedPassed } = await saveResults("complete");

  console.log(`\nModel: ${model}`);
  console.log(`Passed: ${passed}/${selectedSamples.length}`);
  console.log(`Primary labels: ${primaryPassed}/${selectedSamples.length}`);
  console.log(`Completed flags: ${completedPassed}/${selectedSamples.length}`);
  console.log(`Checked/key flags: ${checkedPassed}/${selectedSamples.length}`);
  console.log(`Saved: ${outputPath}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
