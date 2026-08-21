#!/usr/bin/env node

import { validatePublicationFinalization } from "../lib/publication-finalization.mjs";

process.stdout.write(`${JSON.stringify(validatePublicationFinalization(), null, 2)}\n`);
