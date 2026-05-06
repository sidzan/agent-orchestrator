import * as readline from "readline";

let _rl: readline.Interface | null = null;
let _stdinClosed = false;

function rl(): readline.Interface {
  if (!_rl) {
    _rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    _rl.once("close", () => {
      _stdinClosed = true;
    });
  }
  return _rl;
}

export function close(): void {
  if (_rl) {
    _rl.close();
    _rl = null;
  }
}

function ask(question: string): Promise<string> {
  if (_stdinClosed) {
    process.stdout.write(question + "\n");
    return Promise.resolve("");
  }
  return new Promise((resolve) => {
    const r = rl();
    let resolved = false;
    const onClose = () => {
      if (resolved) return;
      resolved = true;
      process.stdout.write("\n");
      resolve("");
    };
    r.once("close", onClose);
    r.question(question, (answer: string) => {
      if (resolved) return;
      resolved = true;
      r.removeListener("close", onClose);
      resolve(answer);
    });
  });
}

export async function text(label: string, defaultValue?: string): Promise<string> {
  const hint = defaultValue !== undefined && defaultValue !== "" ? ` [${defaultValue}]` : "";
  const answer = (await ask(`${label}${hint}: `)).trim();
  return answer || defaultValue || "";
}

export async function confirm(label: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = (await ask(`${label} ${hint} `)).trim().toLowerCase();
  if (answer === "") return defaultYes;
  return ["y", "yes"].includes(answer);
}

export interface ChoiceOption<K extends string = string> {
  key: K;
  label: string;
}

export async function choice<K extends string>(
  label: string,
  options: ChoiceOption<K>[],
  defaultIndex = 0
): Promise<ChoiceOption<K>> {
  const lines = options.map((opt, i) => `  ${i + 1}) ${opt.label}`).join("\n");
  process.stdout.write(`${label}\n${lines}\n`);
  const answer = (await ask(`Choose [${defaultIndex + 1}]: `)).trim();
  const idx = answer === "" ? defaultIndex : Number(answer) - 1;
  if (Number.isNaN(idx) || idx < 0 || idx >= options.length) return options[defaultIndex];
  return options[idx];
}

export interface SelectableItem {
  selected?: boolean;
  [key: string]: unknown;
}

export async function multiSelect<T extends SelectableItem>(
  label: string,
  items: T[],
  getLabel: (x: T) => string = (x) => String(x.label || x.name || "")
): Promise<T[]> {
  process.stdout.write(`${label}\n`);
  items.forEach((item, i) => {
    const mark = item.selected !== false ? "[x]" : "[ ]";
    process.stdout.write(`  ${i + 1}) ${mark} ${getLabel(item)}\n`);
  });
  const raw = (await ask("Toggle by number(s), comma-separated, or Enter to accept: ")).trim();
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
