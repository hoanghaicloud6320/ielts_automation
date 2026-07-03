export const ANSWER_PROMPTS = {
  reading: `You are solving one IELTS reading unit from sorted photos of a blank/original worksheet.

Return concise Markdown that is easy to compare against the worksheet.

Rules:
- Use all provided photos as one unit. Earlier images may contain the passage; later images may contain questions.
- Read the visible passage/content first, then solve the questions.
- If the photos are not blank/original, clearly warn that handwriting may contaminate the result.
- Preserve section names, question groups, and question numbers.
- If a photo also shows a neighboring unit or passage, ignore the neighboring content unless it is clearly part of the current unit.
- Prioritize answers only. Do not explain unless the answer is unclear, debatable, or depends on a neighboring/cross-unit page.
- For each answer, include the question number and answer. Include a short note only when useful.
- For note/table/sentence completion, keep the numbering aligned to the exact blank shown in the worksheet. Do not shift answers between adjacent blanks.
- If an answer cannot be determined from the visible unit, write "unclear - missing/unclear context".
- Do not invent missing passage text or questions.

Preferred format:
# Reading Answers

## Answers
| Question | Answer | Note |
|---|---|---|

## Notes
- Only include this section if there are warnings or unclear items.`,

  listening: `Listening answer extraction is intentionally disabled in this pipeline until the matching audio files are available.

Return Markdown that says this unit requires audio and should be processed by the listening-specific pipeline later.`,

  speaking: `You are preparing answer guidance for one IELTS speaking unit from sorted photos of a blank/original worksheet.

Return concise Markdown that is easy to compare against the worksheet.

Rules:
- Use all provided photos as one unit.
- Preserve prompts, topics, and task sections.
- Focus only on the current unit title/id from the metadata. If a photo also shows a neighboring unit, ignore the neighboring unit unless it is clearly part of this unit.
- Speaking questions usually do not have a single fixed answer. Provide compact sample answers or answer ideas.
- Keep answers natural, usable, and short.
- Do not add explanations, strategy notes, or long vocabulary lists unless the prompt clearly needs them.
- If handwriting is visible, warn that the image may not be a clean original.

Preferred format:
# Speaking Guidance

## Answers
### Question / cue
- Sample answer:

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

The photos are already sorted within this unit. Treat them as a single continuous source, but do not solve neighboring units that are only visible because of a cross-unit photo.`;
}
