# Submit Pipeline Map

Current demo command:

```bash
npm run submit:demo
```

Manual command:

```bash
npm run submit -- submit/les_demo
```

CLI command:

```bash
node bin/ielts-auto.mjs submit submit/les_demo
```

Dry-run upload:

```bash
node bin/ielts-auto.mjs submit submit/les_demo --dry-run
```

Classify one image:

```bash
node bin/ielts-auto.mjs classify submit/les_demo/input/page.jpg
```

Prepare a demo from an extracted sample folder without hardcoded image names:

```bash
node bin/ielts-auto.mjs prepare-demo --sample-root build/tmp/sample_data --lesson-dir submit/les_demo
```

## Flow

```text
submit/les_i/input
  -> src/classifier
  -> src/submit route decision
  -> submit/les_i/classified
       reading/
       listening/
       speaking/
       review/
  -> src/upload/rcloneUploader
  -> ielts-drive:IELTS/submissions/les_i
  -> submit/les_i/reports/submit-report-*.json
```

## Module Boundaries

- `src/classifier`: Gemini prompt, image input, JSON classification result.
- `src/submit`: routing policy from classification result to folder name.
- `src/upload`: rclone upload adapter only.
- `src/ai`: Gemini client creation.
- `src/secrets`: local secret loading.
- `bin/ielts-auto.mjs`: user-facing CLI.
- `scripts`: compatibility wrappers around the CLI/modules.

## Routing Rule

Auto-route only when:

- `primary_label` is `reading`, `listening`, or `speaking`
- confidence is at least `0.75`
- Gemini did not set `should_route_to_review`

Everything else goes to `review`.

## Demo Result

The first demo used `gemini-3.1-flash-lite` and classified 4 sample images:

- reading -> `classified/reading`
- listening -> `classified/listening`
- speaking -> `classified/speaking`
- handwritten notes -> `classified/review`

Upload target confirmed:

```text
ielts-drive:IELTS/submissions/les_demo
```
