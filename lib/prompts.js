"use strict";

const readline = require("readline");

let _rl = null;
let _stdinClosed = false;

function rl() {
  if (!_rl) {
    _rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    _rl.once("close", () => {
      _stdinClosed = true;
    });
  }
  return _rl;
}

function close() {
  if (_rl) {
    _rl.close();
    _rl = null;
  }
}

function ask(question) {
  if (_stdinClosed) {
    // stdin already closed — print the prompt for context and return empty (caller default applies)
    process.stdout.write(question + "\n");
    return Promise.resolve("");
  }
  return new Promise((resolve) => {
    const r = rl();
    let resolved = false;
    const finish = (v) => {
      if (resolved) return;
      resolved = true;
      resolve(v);
    };
    r.question(question, (answer) => finish(answer));
    r.once("close", () => {
      process.stdout.write("\n");
      finish("");
    });
  });
}

async function text(label, defaultValue) {
  const hint = defaultValue !== undefined && defaultValue !== "" ? ` [${defaultValue}]` : "";
  const answer = (await ask(`${label}${hint}: `)).trim();
  return answer || defaultValue || "";
}

async function confirm(label, defaultYes = true) {
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = (await ask(`${label} ${hint} `)).trim().toLowerCase();
  if (answer === "") return defaultYes;
  return ["y", "yes"].includes(answer);
}

async function choice(label, options, defaultIndex = 0) {
  const lines = options.map((opt, i) => `  ${i + 1}) ${opt.label}`).join("\n");
  process.stdout.write(`${label}\n${lines}\n`);
  const answer = (await ask(`Choose [${defaultIndex + 1}]: `)).trim();
  const idx = answer === "" ? defaultIndex : Number(answer) - 1;
  if (Number.isNaN(idx) || idx < 0 || idx >= options.length) return options[defaultIndex];
  return options[idx];
}

async function multiSelect(label, items, getLabel = (x) => x.label || x.name) {
  process.stdout.write(`${label}\n`);
  items.forEach((item, i) => {
    const mark = item.selected !== false ? "[x]" : "[ ]";
    process.stdout.write(`  ${i + 1}) ${mark} ${getLabel(item)}\n`);
  });
  const raw = (
    await ask("Toggle by number(s), comma-separated, or Enter to accept: ")
  ).trim();
  if (raw === "") return items;
  const indices = raw
    .split(/[,\s]+/)
    .map((s) => Number(s) - 1)
    .filter((n) => !Number.isNaN(n) && n >= 0 && n < items.length);
  for (const idx of indices) {
    items[idx].selected = !(items[idx].selected !== false);
  }
  return items;
}

module.exports = { text, confirm, choice, multiSelect, close };
