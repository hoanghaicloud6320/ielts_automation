export async function generateContentWithRetry({ ai, params, retries = 3, log = null }) {
  let attempt = 0;
  const maxRetries = Math.max(retries, (ai.keyCount ?? 1) - 1);

  while (true) {
    try {
      return await ai.models.generateContent(params);
    } catch (error) {
      attempt += 1;
      if ((ai.keyCount ?? 1) <= 1 || attempt > maxRetries || !isRetryableGeminiError(error)) {
        throw error;
      }

      const delayMs = 2_000;
      log?.(`Gemini temporary error; switching API key and retrying in ${Math.ceil(delayMs / 1000)}s...`);
      await sleep(delayMs);
    }
  }
}

export function isRetryableGeminiError(error) {
  const message = error?.message ?? "";
  const causeCode = error?.cause?.code ?? "";
  const causeMessage = error?.cause?.message ?? "";
  return (
    message.includes('"code":429') ||
    message.includes('"code":503') ||
    message.includes('"status":"RESOURCE_EXHAUSTED"') ||
    message.includes('"status":"UNAVAILABLE"') ||
    message.includes('"status":"DEADLINE_EXCEEDED"') ||
    message.includes('"status":"INTERNAL"') ||
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes("UNAVAILABLE") ||
    message.includes("DEADLINE_EXCEEDED") ||
    message.includes("INTERNAL") ||
    message.includes("fetch failed") ||
    message.includes("Headers Timeout Error") ||
    error?.status === 429 ||
    error?.status === 500 ||
    error?.status === 502 ||
    error?.status === 503 ||
    error?.status === 504 ||
    error?.code === 429 ||
    error?.code === 500 ||
    error?.code === 502 ||
    error?.code === 503 ||
    error?.code === 504 ||
    causeCode === "UND_ERR_HEADERS_TIMEOUT" ||
    causeMessage.includes("Headers Timeout Error")
  );
}

// Temporarily disabled: retry delay from Gemini error JSON conflicts with
// key-pool retry. Keep the parser shape here so it is easy to restore later.
// export function retryDelayMs(error) {
//   const message = error?.message ?? "";
//   const match = message.match(/"retryDelay":"(\d+)s"/);
//   if (!match) {
//     return null;
//   }
//
//   return (Number(match[1]) + 2) * 1000;
// }

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
