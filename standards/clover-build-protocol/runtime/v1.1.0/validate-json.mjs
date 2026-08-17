#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import Ajv2020 from 'ajv/dist/2020.js';

const [schemaArg, dataArg, outputArg] = process.argv.slice(2);
if (!schemaArg || !dataArg) {
  console.error('Usage: validate-json.mjs <schema.json> <data.json> [receipt.json]');
  process.exit(2);
}
const schemaPath = path.resolve(schemaArg);
const dataPath = path.resolve(dataArg);
const outputPath = outputArg ? path.resolve(outputArg) : null;
const result = { schemaVersion: '1.1', generatedAt: new Date().toISOString(), schemaPath, dataPath, status: 'failed', errors: [] };
try {
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
  const validate = ajv.compile(schema);
  const valid = validate(data);
  result.status = valid ? 'passed' : 'failed';
  result.errors = validate.errors || [];
} catch (error) {
  result.errors = [{ message: error?.message || String(error) }];
}
if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
}
console.log(`${result.status}: ${path.basename(dataPath)} against ${path.basename(schemaPath)}`);
if (result.status !== 'passed') {
  console.error(JSON.stringify(result.errors, null, 2));
  process.exit(1);
}
