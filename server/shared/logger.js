const sensitiveKeyPattern = /password|token|secret|authorization|cookie|credential|api.?key/i;

function redact(value, key = "") {
  if (sensitiveKeyPattern.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [childKey, redact(childValue, childKey)]),
    );
  }
  return value;
}

/** Emit one JSON record per event; sensitive fields are redacted recursively. */
export function log(level, event, fields = {}) {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...redact(fields),
  };
  const output = JSON.stringify(record);
  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else console.log(output);
}
