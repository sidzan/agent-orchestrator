#!/usr/bin/env node
"use strict";

/**
 * Postbuild: chmod +x the compiled bin entry so npx can run it directly.
 */

const fs = require("fs");
const path = require("path");

const BIN = path.resolve(__dirname, "..", "dist", "bin", "bootstrap.js");
const LINT = path.resolve(__dirname, "..", "dist", "lib", "template-lint.js");

for (const f of [BIN, LINT]) {
  if (fs.existsSync(f)) {
    try {
      fs.chmodSync(f, 0o755);
    } catch (e) {
      console.error(`could not chmod ${f}:`, e.message);
    }
  }
}
console.log("postbuild: chmod +x applied to dist/bin/bootstrap.js + dist/lib/template-lint.js");
