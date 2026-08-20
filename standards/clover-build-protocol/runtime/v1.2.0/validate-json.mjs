#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import Ajv2020 from 'ajv/dist/2020.js';
import { sha256, writeJson } from './lib.mjs';

const [schemaArg, dataArg, outputArg] = process.argv.slice(2);
if (!schemaArg || !dataArg) {
  console.error('Usage: validate-json.mjs <schema.json> <data.json> [receipt.json]');
  process.exit(2);
}
const result = { schemaVersion: '1.2', protocolVersion: '1.2.0', generatedAt: new Date().toISOString(), schemaPath: path.resolve(schemaArg), dataPath: path.resolve(dataArg), status: 'failed', errors: [] };
try {
  const schema = JSON.parse(fs.readFileSync(result.schemaPath, 'utf8'));
  const data = JSON.parse(fs.readFileSync(result.dataPath, 'utf8'));
  result.schemaSha256 = sha256(fs.readFileSync(result.schemaPath));
  result.dataSha256 = sha256(fs.readFileSync(result.dataPath));
  const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
  const validate = ajv.compile(schema);
  result.status = validate(data) ? 'passed' : 'failed';
  result.errors = validate.errors || [];
} catch (error) {
  result.errors = [{ message: error?.message || String(error) }];
}
if (outputArg) writeJson(path.resolve(outputArg), result);
console.log(`${result.status}: ${path.basename(result.dataPath)} against ${path.basename(result.schemaPath)}`);
if (result.status !== 'passed') {
  console.error(JSON.stringify(result.errors, null, 2));
  process.exit(1);
}
