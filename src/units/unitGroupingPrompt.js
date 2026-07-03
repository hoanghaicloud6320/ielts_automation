export function buildUnitGroupingPrompt({ skill = "unknown" } = {}) {
  return `You group worksheet page photos into units/lessons/topics after they have already been classified by skill.

Skill: ${skill}

Return only valid JSON, no markdown.

Rules:
- Group pages by visible unit number, lesson number, topic title, repeated page header, or clear content continuity.
- Do not reorder pages here. Only decide which unit/group each image belongs to.
- One image may belong to more than one unit if it visibly contains content from multiple units, a transition page, or two-page spread crossing units.
- Keep every provided filename in at least one unit.
- Use stable short unit_id values like "unit_04", "lesson_5", "topic_clothes", or "unknown_unit_1".
- Do not trust folder name or filename as a unit signal. Filenames may be scrambled.
- If uncertain, create the best likely group and explain uncertainty.

JSON schema:
{
  "units": [
    {
      "unit_id": "short_stable_id",
      "title": "human readable title",
      "confidence": 0.0,
      "files": [
        {
          "filename": "exact input filename",
          "confidence": 0.0,
          "evidence": ["short reason"]
        }
      ],
      "warnings": ["short warning if any"]
    }
  ],
  "warnings": ["global warning if any"]
}`;
}
