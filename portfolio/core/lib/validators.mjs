import fs from "node:fs";
import path from "node:path";
import { canonicalize } from "./canonical-json.mjs";

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

export function verifyJsonCatalog(coreDirectory) {
  const files = walk(coreDirectory);
  let jsonDocuments = 0;
  let jsonlRecords = 0;
  for (const file of files) {
    if (file.endsWith(".json")) {
      JSON.parse(fs.readFileSync(file, "utf8"));
      jsonDocuments += 1;
    } else if (file.endsWith(".jsonl")) {
      const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
      for (const line of lines) JSON.parse(line);
      jsonlRecords += lines.length;
    }
  }
  return { valid: true, jsonDocuments, jsonlRecords };
}

export function verifySchemaCatalog(schemaDirectory) {
  const files = walk(schemaDirectory).filter((file) => file.endsWith(".schema.json"));
  const ids = new Set();
  for (const file of files) {
    const schema = JSON.parse(fs.readFileSync(file, "utf8"));
    if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
      throw new Error(`${path.basename(file)} does not declare JSON Schema 2020-12`);
    }
    if (typeof schema.$id !== "string" || !schema.$id.startsWith("https://cloverapps.ai/schemas/")) {
      throw new Error(`${path.basename(file)} has no canonical Clover schema ID`);
    }
    if (ids.has(schema.$id)) throw new Error(`Duplicate schema ID ${schema.$id}`);
    ids.add(schema.$id);
    if (schema.type !== "object") throw new Error(`${path.basename(file)} must describe an object root`);
    if (!Array.isArray(schema.required) || schema.required.length === 0) {
      throw new Error(`${path.basename(file)} must declare required root properties`);
    }
    for (const required of schema.required) {
      if (!Object.hasOwn(schema.properties || {}, required)) {
        throw new Error(`${path.basename(file)} requires undefined property ${required}`);
      }
    }
  }
  return { valid: true, schemaCount: files.length, schemaIds: [...ids].sort() };
}

export function assertRootSchemaContract(schema, value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  for (const required of schema.required || []) {
    if (!Object.hasOwn(value, required)) throw new Error(`${label} is missing required field ${required}`);
  }
  if (schema.additionalProperties === false) {
    const allowed = new Set(Object.keys(schema.properties || {}));
    for (const key of Object.keys(value)) {
      if (!allowed.has(key)) throw new Error(`${label} contains unexpected field ${key}`);
    }
  }
  return true;
}

function schemaError(instancePath, message) {
  throw new Error(`JSON Schema violation at ${instancePath || "/"}: ${message}`);
}

function typeMatches(type, value) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

function resolvePointer(document, pointer) {
  if (pointer === "#" || pointer === "") return document;
  if (!pointer.startsWith("#/")) throw new Error(`Unsupported JSON Schema pointer ${pointer}`);
  return pointer.slice(2).split("/").reduce((value, segment) => {
    const key = segment.replace(/~1/g, "/").replace(/~0/g, "~");
    if (value === undefined || !Object.hasOwn(value, key)) throw new Error(`Unresolved JSON Schema pointer ${pointer}`);
    return value[key];
  }, document);
}

function loadExternalSchema(reference, context) {
  const [fileReference, fragment = ""] = reference.split("#", 2);
  const fileName = fileReference.startsWith("http") ? path.basename(new URL(fileReference).pathname) : fileReference;
  const absolutePath = path.resolve(context.schemaDirectory, fileName);
  if (!absolutePath.startsWith(`${path.resolve(context.schemaDirectory)}${path.sep}`)) {
    throw new Error(`External schema reference escapes schema directory: ${reference}`);
  }
  let document = context.cache.get(absolutePath);
  if (!document) {
    document = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
    context.cache.set(absolutePath, document);
  }
  return { document, schema: resolvePointer(document, fragment ? `#${fragment}` : "#") };
}

function validateNode(schema, value, context, instancePath) {
  if (schema === true) return;
  if (schema === false) schemaError(instancePath, "schema is false");
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) throw new TypeError("Schema node must be an object or boolean");

  let activeDocument = context.document;
  if (typeof schema.$ref === "string") {
    if (schema.$ref.startsWith("#")) {
      validateNode(resolvePointer(context.document, schema.$ref), value, context, instancePath);
    } else {
      const external = loadExternalSchema(schema.$ref, context);
      validateNode(external.schema, value, { ...context, document: external.document }, instancePath);
      activeDocument = external.document;
    }
  }

  if (Array.isArray(schema.allOf)) {
    for (const branch of schema.allOf) validateNode(branch, value, { ...context, document: activeDocument }, instancePath);
  }
  if (Array.isArray(schema.oneOf)) {
    let matches = 0;
    for (const branch of schema.oneOf) {
      try {
        validateNode(branch, value, { ...context, document: activeDocument }, instancePath);
        matches += 1;
      } catch {}
    }
    if (matches !== 1) schemaError(instancePath, `oneOf matched ${matches} branches`);
  }
  if (schema.if) {
    let condition = true;
    try { validateNode(schema.if, value, { ...context, document: activeDocument }, instancePath); } catch { condition = false; }
    if (condition && schema.then) validateNode(schema.then, value, { ...context, document: activeDocument }, instancePath);
    if (!condition && schema.else) validateNode(schema.else, value, { ...context, document: activeDocument }, instancePath);
  }

  if (schema.const !== undefined && canonicalize(value) !== canonicalize(schema.const)) {
    schemaError(instancePath, `must equal const ${canonicalize(schema.const)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((entry) => canonicalize(entry) === canonicalize(value))) {
    schemaError(instancePath, "is not in enum");
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => typeMatches(type, value))) schemaError(instancePath, `must have type ${types.join(" or ")}`);
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) schemaError(instancePath, "is shorter than minLength");
    if (schema.maxLength !== undefined && value.length > schema.maxLength) schemaError(instancePath, "is longer than maxLength");
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, "u").test(value)) schemaError(instancePath, "does not match pattern");
    if (schema.format === "date-time" && !Number.isFinite(Date.parse(value))) schemaError(instancePath, "is not a date-time");
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    if (schema.minimum !== undefined && value < schema.minimum) schemaError(instancePath, "is below minimum");
    if (schema.maximum !== undefined && value > schema.maximum) schemaError(instancePath, "is above maximum");
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) schemaError(instancePath, "has too few items");
    if (schema.maxItems !== undefined && value.length > schema.maxItems) schemaError(instancePath, "has too many items");
    if (schema.uniqueItems === true) {
      const serialized = value.map(canonicalize);
      if (new Set(serialized).size !== serialized.length) schemaError(instancePath, "items are not unique");
    }
    if (schema.items) value.forEach((entry, index) => validateNode(schema.items, entry, { ...context, document: activeDocument }, `${instancePath}/${index}`));
    if (schema.contains) {
      const found = value.some((entry, index) => {
        try { validateNode(schema.contains, entry, { ...context, document: activeDocument }, `${instancePath}/${index}`); return true; } catch { return false; }
      });
      if (!found) schemaError(instancePath, "does not contain a matching item");
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const required of schema.required || []) {
      if (!Object.hasOwn(value, required)) schemaError(instancePath, `is missing required property ${required}`);
    }
    const properties = schema.properties || {};
    for (const [key, entry] of Object.entries(value)) {
      const childPath = `${instancePath}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`;
      if (Object.hasOwn(properties, key)) validateNode(properties[key], entry, { ...context, document: activeDocument }, childPath);
      else if (schema.additionalProperties === false) schemaError(childPath, "is an additional property");
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        validateNode(schema.additionalProperties, entry, { ...context, document: activeDocument }, childPath);
      }
    }
  }
}

export function validateJsonSchema(schema, value, options) {
  const schemaDirectory = path.resolve(options.schemaDirectory);
  validateNode(schema, value, {
    schemaDirectory,
    document: schema,
    cache: new Map()
  }, options.label || "");
  return { valid: true };
}
