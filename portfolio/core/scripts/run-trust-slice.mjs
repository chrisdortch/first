#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { canonicalize } from "../lib/canonical-json.mjs";
import { runTrustSlice } from "../lib/trust-slice.mjs";

function readArguments(argumentsList) {
  const options = {};
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--output") {
      const value = argumentsList[index + 1];
      if (!value) throw new Error("--output requires a directory");
      options.workspaceDirectory = path.resolve(value);
      index += 1;
    } else if (argument === "--fixtures") {
      const value = argumentsList[index + 1];
      if (!value) throw new Error("--fixtures requires a directory");
      options.fixturesDirectory = path.resolve(value);
      index += 1;
    } else if (argument === "--as-of") {
      const value = argumentsList[index + 1];
      if (!value) throw new Error("--as-of requires an ISO-8601 timestamp");
      options.asOf = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument ${argument}`);
    }
  }
  return options;
}

const options = readArguments(process.argv.slice(2));
if (!options.workspaceDirectory) {
  options.workspaceDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "clover-trust-slice-"));
}
const result = runTrustSlice(options);
process.stdout.write(`${canonicalize({
  result: result.receipt.result,
  receiptHash: result.receipt.receiptHash,
  workspaceDirectory: result.workspaceDirectory,
  receiptPath: result.receiptPath
})}\n`);
