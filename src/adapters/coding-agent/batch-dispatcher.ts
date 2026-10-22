import { closeSync, openSync, readSync } from "node:fs";

/** Dispatchers are a few lines; anything past this bound is not read. */
const MAX_DISPATCHER_BYTES = 64 * 1024;

/** Reads the head of a dispatcher; throws when it cannot be read. */
export type ReadDispatcherFn = (path: string) => string;

export type BatchDispatcherVerdict =
  | { preservesEmptyArguments: true }
  | { preservesEmptyArguments: false; reason: "powershell_hop" | "unreadable" };

function readDispatcherHead(path: string): string {
  const fd = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(MAX_DISPATCHER_BYTES);
    const bytes = readSync(fd, buffer, 0, MAX_DISPATCHER_BYTES, 0);
    return buffer.subarray(0, bytes).toString("latin1");
  } finally {
    closeSync(fd);
  }
}

/** `REM ...` and `:: ...` lines are comments; a mention there forwards nothing. */
const COMMENT_LINE = /^\s*(?:@?rem(?:\s|$)|::)/i;
/** `%~dp0` expands to the dispatcher's own directory with a trailing separator. */
const POWERSHELL_HOP = /(?:^|[\s"'(&|@\\/]|%~dp0)(?:powershell|pwsh)(?:\.exe)?(?=[\s"')&|]|$)/i;

/**
 * Can this .cmd/.bat dispatcher deliver an empty-string argument to the CLI it launches?
 *
 * cmd.exe hands "" to the batch file intact, and a dispatcher that forwards %* straight to a
 * native image or to node (the npm cmd-shim layout) delivers it as an empty argv entry. A
 * dispatcher that forwards through "powershell -File ... %*" does not: the PowerShell hop drops
 * the empty values, so --setting-sources "" --max-turns 1 arrives as
 * --setting-sources --max-turns 1 (#7518). The bytes of the dispatcher about to be run are the
 * evidence; nothing is guessed from install paths. An unreadable dispatcher proves nothing and is
 * reported as such.
 */
export function inspectBatchDispatcher(path: string, read: ReadDispatcherFn = readDispatcherHead): BatchDispatcherVerdict {
  let body: string;
  try {
    body = read(path);
  } catch {
    return { preservesEmptyArguments: false, reason: "unreadable" };
  }
  const forwardsThroughPowerShell = body
    .split(/\r?\n/)
    .some(line => !COMMENT_LINE.test(line) && POWERSHELL_HOP.test(line));
  return forwardsThroughPowerShell
    ? { preservesEmptyArguments: false, reason: "powershell_hop" }
    : { preservesEmptyArguments: true };
}
