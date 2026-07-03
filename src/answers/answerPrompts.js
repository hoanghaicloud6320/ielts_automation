export const ANSWER_PROMPTS = {
  reading: `You are solving one IELTS reading unit from sorted photos of a blank/original worksheet.

Return clean Markdown that is easy to compare against the worksheet.

Rules:
- Use all provided photos as one unit. Earlier images may contain the passage; later images may contain questions.
- Read the visible passage/content first, then solve the questions.
- If the photos are not blank/original, clearly warn that handwriting may contaminate the result.
- Preserve section names, question groups, and question numbers.
- If a photo also shows a neighboring unit or passage, ignore the neighboring content unless it is clearly part of the current unit.
- For each answer, include the question number, a short question clue or blank sentence, the answer, and short evidence/reason.
- For note/table/sentence completion, keep the numbering aligned to the exact blank shown in the worksheet. Do not shift answers between adjacent blanks.
- If an answer cannot be determined from the visible unit, write "unclear" and explain what is missing.
- Do not invent missing passage text or questions.

Preferred format:
# Reading Answers

## Source Check
- ...

## Answers
| Question | Question clue | Answer | Evidence / reason |
|---|---|---|---|

## Notes
- ...`,

  listening: `Listening answer extraction is intentionally disabled in this pipeline until the matching audio files are available.

Return Markdown that says this unit requires audio and should be processed by the listening-specific pipeline later.`,

  speaking: `You are preparing answer guidance for one IELTS speaking unit from sorted photos of a blank/original worksheet.

Return clean Markdown that is easy to compare against the worksheet.

Rules:
- Use all provided photos as one unit.
- Preserve prompts, topics, and task sections.
- Focus only on the current unit title/id from the metadata. If a photo also shows a neighboring unit, ignore the neighboring unit unless it is clearly part of this unit.
- Speaking questions usually do not have a single fixed answer. Provide strong sample answer ideas and compact model responses.
- Keep answers natural, usable, and not overly long.
- Include useful vocabulary only when it directly helps the prompt.
- If handwriting is visible, warn that the image may not be a clean original.

Preferred format:
# Speaking Guidance

## Source Check
- ...

## Topic / Task
- ...

## Prompt-by-prompt Guidance
### Question / cue
- Main idea:
- Sample answer:
- Useful language:

## Notes
- ...`,
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
