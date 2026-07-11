import { GoogleGenAI } from "@google/genai";
import { DEFAULT_GEMINI_MODEL } from "../config/defaults.js";
import { isRetryableGeminiError, sleep } from "./generateWithRetry.js";

export function createGeminiClient({ apiKey, apiKeys, model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL }) {
  const keys = normalizeApiKeys(apiKeys ?? apiKey);
  if (!keys.length) {
    throw new Error("Missing Gemini API key.");
  }

  return {
    model,
    ai: keys.length === 1 ? attachKeyCount(new GoogleGenAI({ apiKey: keys[0] }), 1) : createGeminiPool(keys),
  };
}

function createGeminiPool(apiKeys) {
  const clients = apiKeys.map((key) => new GoogleGenAI({ apiKey: key }));
  let activeIndex = 0;

  return {
    keyCount: clients.length,
    models: {
      generateContent: (params) =>
        callWithKeyRotation({
          clients,
          activeIndexRef: () => activeIndex,
          setActiveIndex: (nextIndex) => {
            activeIndex = nextIndex;
          },
          call: (client) => client.models.generateContent(params),
          retryInsidePool: false,
        }),
    },
    files: {
      upload: (params) =>
        callWithKeyRotation({
          clients,
          activeIndexRef: () => activeIndex,
          setActiveIndex: (nextIndex) => {
            activeIndex = nextIndex;
          },
          call: (client) => client.files.upload(params),
          retryInsidePool: true,
        }),
    },
  };
}

async function callWithKeyRotation({
  clients,
  activeIndexRef,
  setActiveIndex,
  call,
  retryInsidePool,
  retries = clients.length - 1,
}) {
  let attempt = 0;

  while (true) {
    const currentIndex = activeIndexRef();
    try {
      return await call(clients[currentIndex]);
    } catch (error) {
      const retryable = isRetryableGeminiError(error);
      if (retryable && clients.length > 1) {
        setActiveIndex((currentIndex + 1) % clients.length);
      }

      if (!retryInsidePool || attempt >= retries || !retryable) {
        throw error;
      }

      attempt += 1;
      await sleep(2_000);
    }
  }
}

function attachKeyCount(ai, keyCount) {
  Object.defineProperty(ai, "keyCount", {
    value: keyCount,
    enumerable: false,
  });
  return ai;
}

function normalizeApiKeys(value) {
  return (Array.isArray(value) ? value : [value])
    .flatMap((item) => String(item ?? "").split(/[\r\n,;]+/))
    .map((item) => item.trim())
    .filter(Boolean);
}
