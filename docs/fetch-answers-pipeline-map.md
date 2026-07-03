# Fetch Answers Pipeline Map

Warning for users:

```text
Take photos of the original blank worksheet before doing the homework.
If the photos already contain handwriting, checked answers, or corrections, AI extraction can be contaminated.
```

## CLI

Classify and organize blank/original source pages:

```bash
node bin/ielts-auto.mjs fetch-answers fetch/les_1
```

Classify and ask Gemini to extract answers/guidance:

```bash
node bin/ielts-auto.mjs fetch-answers fetch/les_1 --extract-answers
```

## Flow

```text
fetch/les_i/input
  -> src/classifier
  -> fetch/les_i/organized
       reading/
       listening/
       speaking/
       review/
  -> src/reorder, per skill only
  -> fetch/les_i/sorted_classified
       reading/
       listening/
       speaking/
       review/
  -> optional src/answers extraction
  -> fetch/les_i/answers
       reading.md
       listening.md
       speaking.md
  -> fetch/les_i/reports/fetch-answers-report-*.json
```

## Current Scope

Implemented now:

- classify blank/original page photos by visible content
- group pages into skill folders
- reorder pages locally inside each skill group
- write clean downstream input to `sorted_classified`
- warn when classifier sees completed/checked pages
- optional Gemini answer/guidance extraction per skill

Still experimental:

- answer extraction prompt quality
- UI for comparing/checking answers

## Current Reorder Pipeline Test

Mixed input fixture:

```text
fetch/les_reorder_mix/input
```

It contains mixed reading/listening/speaking pages with scrambled filenames.

Result:

- classification created `organized/{reading,listening,speaking}`
- local per-skill reorder created `sorted_classified/{reading,listening,speaking}`
- expected order matched for all 12 test pages

Important: reorder was performed only after classification, and separately inside each skill group.

## Module Boundaries

- `src/fetch`: pipeline orchestration for fetch answers.
- `src/answers`: skill-specific answer/guidance prompts and Gemini answer extraction.
- `src/classifier`: shared visual classifier.
