export function parseArgs(argv) {
  const result = {
    command: argv[0],
    positionals: [],
    options: {},
  };

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      result.positionals.push(arg);
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());

    if (inlineValue !== undefined) {
      result.options[key] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      result.options[key] = next;
      index += 1;
    } else {
      result.options[key] = true;
    }
  }

  return result;
}

export function numberOption(value, fallback) {
  if (value === undefined || value === true) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
