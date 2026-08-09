export type ChangeDomain =
  | "contracts"
  | "frontend"
  | "desktop"
  | "backend"
  | "windowsNative"
  | "docsSpec";

export type ChangeClassification = Readonly<{
  domains: Record<ChangeDomain, boolean>;
  unknownPaths: string[];
  forceFull: boolean;
}>;

export const CHANGE_DOMAINS: readonly ChangeDomain[];

export function classifyChangedPaths(paths: string[]): ChangeClassification;
export function parseNameStatusZ(output: string): string[];
export function changedPathsBetweenCommits(
  base: string,
  head: string,
  cwd?: string,
): string[];
export function runChangeClassifierCli(
  argv?: string[],
  cwd?: string,
): ChangeClassification | null;
