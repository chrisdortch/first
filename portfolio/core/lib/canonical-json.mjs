import crypto from "node:crypto";

function assertUnicodeScalarString(value, label = "string") {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new TypeError(`Canonical JSON rejects an unpaired high surrogate in ${label}`);
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new TypeError(`Canonical JSON rejects an unpaired low surrogate in ${label}`);
    }
  }
}

function serialize(value, seen) {
  if (value === null || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    assertUnicodeScalarString(value);
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON rejects non-finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new TypeError("Canonical JSON rejects cycles");
    seen.add(value);
    const result = `[${value.map((entry) => serialize(entry, seen)).join(",")}]`;
    seen.delete(value);
    return result;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical JSON accepts only plain objects and arrays");
    }
    if (seen.has(value)) throw new TypeError("Canonical JSON rejects cycles");
    seen.add(value);
    const keys = Object.keys(value).sort();
    const fields = keys.map((key) => {
      assertUnicodeScalarString(key, "object key");
      const entry = value[key];
      if (entry === undefined || typeof entry === "function" || typeof entry === "symbol" || typeof entry === "bigint") {
        throw new TypeError(`Canonical JSON rejects unsupported value at ${key}`);
      }
      return `${JSON.stringify(key)}:${serialize(entry, seen)}`;
    });
    seen.delete(value);
    return `{${fields.join(",")}}`;
  }
  throw new TypeError(`Canonical JSON rejects ${typeof value}`);
}

export function canonicalize(value) {
  return serialize(value, new Set());
}

export function sha256Bytes(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function sha256Canonical(value) {
  return sha256Bytes(canonicalize(value));
}

export function assertSha256(value, label = "hash") {
  if (!/^[a-f0-9]{64}$/.test(String(value || ""))) {
    throw new TypeError(`${label} must be a lowercase SHA-256 hex digest`);
  }
  return value;
}

export function cloneJson(value) {
  return JSON.parse(canonicalize(value));
}
