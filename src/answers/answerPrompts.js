export const ANSWER_PROMPTS = {
  reading: `You are solving one IELTS reading unit from sorted photos of a blank/original worksheet.

Return Markdown that is easy to compare against the worksheet. Keep it concise, but complete.

Rules:
- Use all provided photos as one unit. Earlier images may contain the passage; later images may contain questions.
- Read the visible passage/content first, then solve the questions.
- If the photos are not blank/original, clearly warn that handwriting may contaminate the result.
- Preserve every visible question group and question number.
- Before answering, silently inventory all visible numbered questions/exercises in the unit. Output an answer row for every visible item. Do not omit easy vocabulary, matching, table, or sentence-completion sections.
- If a photo also shows a neighboring unit or passage, ignore the neighboring content unless it is clearly part of the current unit.
- If the allowed scope says "left page only", "right page only", or another limited region, mentally crop to that region. Do not answer anything outside that region.
- If your answer starts mentioning another passage/unit title, stop and remove that neighboring content.
- Prioritize answers only. Do not explain unless the answer is unclear, debatable, or depends on a neighboring/cross-unit page.
- For each answer, include the question number and answer. Include a short note only when useful.
- For note/table/sentence completion, keep the numbering aligned to the exact blank shown in the worksheet. Do not shift answers between adjacent blanks.
- If a question depends on missing passage text, write "unclear - missing passage/context"; do not guess NOT GIVEN just because the relevant passage is absent.
- If pages appear mixed across units, solve only the sections whose question text and source passage/topic visibly match. Put suspected cross-unit pages in Notes.
- Do not invent missing passage text or questions.

Preferred format:
# Reading Answers

| Question | Answer | Note |
|---|---|---|

## Notes
- Only include this section if there are warnings or unclear items.`,

  listening: `Listening answer extraction is intentionally disabled in this pipeline until the matching audio files are available.

Return Markdown that says this unit requires audio and should be processed by the listening-specific pipeline later.`,

  speaking: `You are solving one IELTS speaking/topic-language unit from sorted photos of a blank/original worksheet.

Return Markdown that is easy to compare against the worksheet. Keep it concise, but complete.

Rules:
- Use all provided photos as one unit.
- Preserve every visible prompt, topic, numbered exercise, and task section, but output answers only.
- Before answering, silently inventory all visible numbered exercises/prompts in the unit. Output something for every visible item.
- Focus only on the current unit title/id from the metadata. If a photo also shows a neighboring unit, ignore the neighboring unit unless it is clearly part of this unit.
- If the allowed scope says "left page only", "right page only", or another limited region, mentally crop to that region. Do not answer anything outside that region.
- If your answer starts mentioning another unit title, stop and remove that neighboring content.
- Many speaking/topic pages contain vocabulary, matching, gap-fill, collocation, word form, and "add your own words" exercises. Solve those like workbook answers, not as general advice.
- For open personal speaking prompts, provide compact sample answers or answer ideas.
- Keep answers natural and usable, but do not omit sections just to stay short.
- Do not add strategy notes or long vocabulary lists unless the prompt clearly asks for them.
- If handwriting is visible, warn that the image may not be a clean original.

Preferred format:
# Speaking Guidance

### Section name
| Item | Answer |
|---|---|

### Open prompt / cue
- Sample answer: ...

## Notes
- Only include this section if there are warnings or unclear items.`,
};

export function answerPromptForSkill(skill) {
  return ANSWER_PROMPTS[skill] ?? ANSWER_PROMPTS.reading;
}

export function answerPromptForUnit({ skill, unit }) {
  const basePrompt = answerPromptForSkill(skill);
  return `${basePrompt}

Unit metadata:
- skill: ${skill}
- unit_id: ${unit?.unit_id ?? "unknown"}
- title: ${unit?.title ?? "unknown"}

Unit image scope:
${formatUnitFiles(unit)}

The photos are already sorted within this unit. Treat them as a single continuous source.
Only solve the current unit. If a photo is a cross-unit spread, use only the page_region listed above and ignore the neighboring page/region.
Before final output, check that every heading belongs to unit_id "${unit?.unit_id ?? "unknown"}" / title "${unit?.title ?? "unknown"}". Remove any neighboring unit headings and answers.`;
}

function formatUnitFiles(unit) {
  const files = Array.isArray(unit?.source_files) ? unit.source_files : [];
  if (!files.length) {
    return "- no per-image scope metadata available";
  }

  return files
    .map((file, index) => {
      const region = file.page_region || "whole image";
      const pages = Array.isArray(file.visible_pages) && file.visible_pages.length ? ` pages ${file.visible_pages.join(", ")}` : "";
      return `- ${index + 1}. ${file.filename}: ${region}${pages}`;
    })
    .join("\n");
}
