#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Ajv2020 from "ajv/dist/2020.js";
import { sha256, writeJson } from "./integrity.mjs";

const [schemaArgument, dataArgument, outputArgument] = process.argv.slice(2);
if (!schemaArgument || !dataArgument) {
  console.error("Usage: validate-json.mjs <schema.json> <data.json> [receipt.json]");
  process.exit(2);
}
const schemaPath = path.resolve(schemaArgument);
const dataPath = path.resolve(dataArgument);
const result = {
  schemaVersion: "1.1",
  protocolVersion: "1.0.1",
  generatedAt: new Date().toISOString(),
  schemaPath,
  dataPath,
  schemaSha256: null,
  dataSha256: null,
  status: "failed",
  errors: []
};
try {
  const schemaBytes = fs.readFileSync(schemaPath);
  const dataBytes = fs.readFileSync(dataPath);
  const schema = JSON.parse(schemaBytes.toString("utf8"));
  const data = JSON.parse(dataBytes.toString("utf8"));
  result.schemaSha256 = sha256(schemaBytes);
  result.dataSha256 = sha256(dataBytes);
  const validate = new Ajv2020({ allErrors: true, strict: true, validateFormats: false }).compile(schema);
  result.status = validate(data) ? "passed" : "failed";
  result.errors = validate.errors || [];
} catch (error) {
  result.errors = [{ message: error?.message || String(error) }];
}
if (outputArgument) writeJson(path.resolve(outputArgument), result);
console.log(`${result.status}: ${path.basename(dataPath)} against ${path.basename(schemaPath)}`);
if (result.status !== "passed") {
  console.error(JSON.stringify(result.errors, null, 2));
  process.exit(1);
}
