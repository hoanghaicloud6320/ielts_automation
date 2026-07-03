# Listening Prompt Design

Listening is handled separately from reading/speaking because it needs audio.

## Pipeline Shape

After the shared classify -> group -> reorder steps:

1. Process one audio at a time.
2. Request 1: upload only that audio and ask Gemini for a clean English transcript.
3. Request 2: send only the sorted, upright worksheet photos and ask Gemini to build a skeleton.
4. Request 3: send the transcript plus the skeleton, optionally with worksheet photos again, and ask Gemini to fill the skeleton.

Do not process two audio files in the same request. Each audio starts numbering from 1.

## Important Invariants

- Transcript is the primary source.
- Worksheet images are alignment sources: they confirm blank locations and surrounding wording.
- Blue handwritten markers every five blanks are absolute anchors for block boundaries.
- Rotate worksheet photos upright before sending them to Gemini. Sideways pages make marker/blank alignment much less stable.
- Ask the model to output a `Marker check` line before the blocks. Every marker listed there must have a corresponding block.
- Build the skeleton before filling answers. The skeleton owns numbering, marker anchors, block boundaries, and blank count.
- The fill step must not add, remove, merge, or renumber blanks from the skeleton.
- The model must match worksheet wording to transcript wording, not guess from blank count alone.
- If a worksheet photo is unclear, output `unclear - reason`.
- A final block may contain fewer than five answers.

## Output Contract

```md
# AUDIO_NAME

Marker check: visible blue markers = 1, 6, 11, ...

### BLOCK 1

* **Signature:** `short context before blank 1`
* **1.** answer
* **2.** answer
* **3.** answer
* **4.** answer
* **5.** answer

### BLOCK 2

* **Signature:** `short context before blank 6`
* **6.** answer
* **7.** answer
* **8.** answer
* **9.** answer
* **10.** answer
```

The signature should be a short phrase near the first blank in the block so the user can quickly verify the location.

Prompt builders live in `src/listening/listeningPrompts.js`.

Runtime helpers live in `src/listening/listeningExtractor.js`.
