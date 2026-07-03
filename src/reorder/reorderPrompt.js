export function buildReorderPrompt({ skill = "unknown" } = {}) {
  return `You reorder shuffled worksheet page photos from one IELTS lesson and one skill group.

Skill hint: ${skill}

Return only valid JSON, no markdown.

Rules:
- Use visible page numbers, unit numbers, exercise numbers, section headings, continuation clues, and left/right page layout.
- Do not trust the input filename as page order. Filenames may be scrambled.
- If visible page numbers exist, use them as the strongest signal.
- If no page numbers are visible, use exercise sequence and content flow.
- Keep every provided filename exactly once.
- If uncertain, still choose the most likely order and explain uncertainty briefly.

JSON schema:
{
  "ordered_files": [
    {
      "filename": "exact input filename",
      "position": 1,
      "confidence": 0.0,
      "evidence": ["short reason"]
    }
  ],
  "overall_confidence": 0.0,
  "warnings": ["short warning if any"]
}`;
}
