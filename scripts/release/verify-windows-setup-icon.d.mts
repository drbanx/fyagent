export interface CanonicalIconFrame {
  readonly index: number;
  readonly widthByte: number;
  readonly heightByte: number;
  readonly width: number;
  readonly height: number;
  readonly colorCount: number;
  readonly planes: number;
  readonly bitCount: number;
  readonly size: number;
  readonly bytes: Buffer;
}

export interface VerifiedSetupIconFrame {
  readonly resourceId: number;
  readonly width: number;
  readonly height: number;
  readonly bitCount: number;
  readonly size: number;
}

export interface VerifiedSetupIcon {
  readonly groupResourceId: number;
  readonly languageId: number;
  readonly frames: readonly VerifiedSetupIconFrame[];
}

export function parseCanonicalIco(
  buffer: Buffer,
): readonly CanonicalIconFrame[];

export function verifyWindowsSetupIconBytes(
  setupBytes: Buffer,
  canonicalIcoBytes: Buffer,
): VerifiedSetupIcon;

export function verifyWindowsSetupIconFiles(
  setupPath: string,
  canonicalIcoPath: string,
): VerifiedSetupIcon;

export function runWindowsSetupIconCli(argv?: readonly string[]): void;
