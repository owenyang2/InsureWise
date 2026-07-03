import fs from "node:fs";
import path from "node:path";

/** Python interpreter for Moorcheh worker — prefers repo .venv, then PYTHON_BIN, then python3. */
export function resolvePythonBin(): string {
  if (process.env.PYTHON_BIN) {
    return process.env.PYTHON_BIN;
  }

  const candidates = [
    path.resolve(process.cwd(), "../../.venv/bin/python3"),
    path.resolve(process.cwd(), ".venv/bin/python3"),
    "python3",
  ];

  for (const candidate of candidates) {
    if (candidate === "python3" || fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return "python3";
}
