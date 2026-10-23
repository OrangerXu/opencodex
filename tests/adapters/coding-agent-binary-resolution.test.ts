import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { whichFromPath } from "../../src/adapters/coding-agent/profile";
import { QODER_CN_PROFILE } from "../../src/adapters/qoder/profiles";

// Windows resolution must prefer a real executable over a .cmd shim:
// a dispatcher forwards through cmd.exe (and often PowerShell), and an
// empty-string argument does not survive that hop, so the next flag is
// swallowed as its value (#7518). On other platforms whichFromPath is a
// plain first-match scan and these scenarios collapse.
const isWin = process.platform === "win32";
const maybeTest = isWin ? test : test.skip;

function dirWith(files: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "ocx-which-"));
  for (const file of files) writeFileSync(join(dir, file), "");
  return dir;
}

function withPath(dirs: string[], run: () => void): void {
  const saved = process.env.PATH;
  process.env.PATH = dirs.join(delimiter);
  try {
    run();
  } finally {
    process.env.PATH = saved;
  }
}

maybeTest("prefers the .exe over a same-directory .cmd shim", () => {
  const dir = dirWith(["agent.cmd", "agent.exe"]);
  withPath([dir], () => {
    expect(whichFromPath("agent")).toBe(join(dir, "agent.exe"));
  });
});

maybeTest("prefers an .exe further down the PATH over an earlier .cmd", () => {
  const cmdDir = dirWith(["agent.cmd"]);
  const exeDir = dirWith(["agent.exe"]);
  withPath([cmdDir, exeDir], () => {
    expect(whichFromPath("agent")).toBe(join(exeDir, "agent.exe"));
  });
});

maybeTest("still resolves a .cmd when no .exe exists anywhere on the PATH", () => {
  const dir = dirWith(["agent.cmd"]);
  withPath([dir], () => {
    expect(whichFromPath("agent")).toBe(join(dir, "agent.cmd"));
  });
});

maybeTest("falls back to a .bat when it is the only form present", () => {
  const dir = dirWith(["agent.bat"]);
  withPath([dir], () => {
    expect(whichFromPath("agent")).toBe(join(dir, "agent.bat"));
  });
});

test("the Qoder CN profile names the real executable before the .cmd dispatcher", () => {
  // The installer puts qodercn.cmd (a PowerShell dispatcher) and the real
  // qoderclicn.exe in different directories, so PATH order alone cannot
  // prefer the executable: the profile has to try it first (#7518).
  expect(QODER_CN_PROFILE.binaryCandidates[0]).toBe("qoderclicn");
});
