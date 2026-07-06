export async function generateContentWithRetry({ ai, params, retries = 3, log = null }) {
  let attempt = 0;

  while (true) {
    try {
      return await ai.models.generateContent(params);
    } catch (error) {
      attempt += 1;
      if (attempt > retries || !isRetryableGeminiError(error)) {
        throw error;
      }

      const delayMs = retryDelayMs(error) ?? 20_000;
      log?.(`Gemini rate limit hit; retrying in ${Math.ceil(delayMs / 1000)}s...`);
      await sleep(delayMs);
    }
  }
}

function isRetryableGeminiError(error) {
  const message = error?.message ?? "";
  const causeCode = error?.cause?.code ?? "";
  const causeMessage = error?.cause?.message ?? "";
  return (
    message.includes('"code":429') ||
    message.includes('"code":503') ||
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes("UNAVAILABLE") ||
    message.includes("fetch failed") ||
    message.includes("Headers Timeout Error") ||
    causeCode === "UND_ERR_HEADERS_TIMEOUT" ||
    causeMessage.includes("Headers Timeout Error")
  );
}

function retryDelayMs(error) {
  const message = error?.message ?? "";
  const match = message.match(/"retryDelay":"(\d+)s"/);
  if (!match) {
    return null;
  }

  return (Number(match[1]) + 2) * 1000;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
