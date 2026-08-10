import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseCanonicalIco,
  verifyWindowsSetupIconBytes,
  type CanonicalIconFrame,
} from "../scripts/release/verify-windows-setup-icon.mjs";

const ROOT = path.resolve(__dirname, "..");
const SCRIPT = path.join(
  ROOT,
  "scripts",
  "release",
  "verify-windows-setup-icon.mjs",
);
const CANONICAL_ICO = path.join(ROOT, "src-tauri", "icons", "icon.ico");
const RESOURCE_RVA = 0x1000;
const RESOURCE_FILE_OFFSET = 0x200;
const temporaryRoots: string[] = [];

function executableJavaScript(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/(^|[^:])\/\/.*$/gmu, "$1");
}

function assertZeroCopyLeafPayloadSource(source: string): void {
  const start = source.indexOf("function parseResourceLeaves(buffer, pe) {");
  const end = source.indexOf("\nfunction numericIconLeaf(", start);
  if (start < 0 || end < 0) {
    throw new Error("Could not isolate parseResourceLeaves source");
  }
  const body = executableJavaScript(source.slice(start, end));
  const byteInitializers = body.match(/\bbytes\s*:/gu) ?? [];
  const zeroCopyInitializers =
    body.match(
      /\bbytes\s*:\s*buffer\.subarray\(\s*mapped\.fileOffset\s*,\s*mapped\.fileOffset\s*\+\s*size\s*\)\s*,/gu,
    ) ?? [];
  if (byteInitializers.length !== 1 || zeroCopyInitializers.length !== 1) {
    throw new Error(
      "parseResourceLeaves must expose exactly one zero-copy payload subarray",
    );
  }
}

interface FixtureFrame {
  readonly width: number;
  readonly height: number;
  readonly widthByte: number;
  readonly heightByte: number;
  readonly colorCount: number;
  readonly planes: number;
  readonly bitCount: number;
  readonly bytes: Buffer;
}

interface GroupFrame extends FixtureFrame {
  readonly resourceId: number;
  readonly size: number;
}

interface GroupDefinition {
  readonly resourceId: number;
  readonly languageId: number;
  readonly frames: readonly GroupFrame[];
}

interface IconDefinition {
  readonly resourceId: number;
  readonly languageId: number;
  readonly bytes: Buffer;
}

interface ResourceLeaf {
  readonly kind: "leaf";
  readonly bytes: Buffer;
  directoryEntryOffset?: number;
  dataEntryOffset?: number;
  payloadOffset?: number;
}

interface ResourceDirectory {
  readonly kind: "directory";
  readonly children: ResourceChild[];
  offset?: number;
}

type ResourceNode = ResourceLeaf | ResourceDirectory;

interface ResourceChild {
  readonly id?: number;
  readonly name?: string;
  readonly node: ResourceNode;
  nameOffset?: number;
}

interface PeFixture {
  readonly bytes: Buffer;
  readonly resourceRoot: ResourceDirectory;
  readonly resourceDirectoryEntryOffset: number;
  readonly resourceSectionHeaderOffset: number;
  readonly resourceSize: number;
}

function temporaryDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "fyagent-icon-pe-"));
  temporaryRoots.push(directory);
  return directory;
}

function align(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

function pngChunk(type: string, data = Buffer.alloc(0)): Buffer {
  const bytes = Buffer.alloc(12 + data.length);
  bytes.writeUInt32BE(data.length, 0);
  bytes.write(type, 4, "ascii");
  data.copy(bytes, 8);
  // The verifier intentionally treats the canonical raw frame as authority;
  // fixture CRC bytes are present structurally but do not need a PNG codec.
  bytes.writeUInt32BE(0, 8 + data.length);
  return bytes;
}

function makePng(width: number, height: number, marker: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", Buffer.from([marker])),
    pngChunk("IEND"),
  ]);
}

function highBitChunkType(frame: Buffer, type: string): Buffer {
  const changed = Buffer.from(frame);
  const expected = Buffer.from(type, "ascii");
  let cursor = 8;
  while (cursor < changed.length) {
    const dataLength = changed.readUInt32BE(cursor);
    if (changed.subarray(cursor + 4, cursor + 8).equals(expected)) {
      for (let index = 0; index < 4; index += 1) {
        changed[cursor + 4 + index] |= 0x80;
      }
      return changed;
    }
    cursor += 12 + dataLength;
  }
  throw new Error(`PNG fixture does not contain ${type}`);
}

function makeFrames(): readonly FixtureFrame[] {
  return [
    { width: 16, height: 16, marker: 0x11 },
    { width: 32, height: 32, marker: 0x22 },
    { width: 256, height: 256, marker: 0x33 },
  ].map(({ width, height, marker }) => ({
    width,
    height,
    widthByte: width === 256 ? 0 : width,
    heightByte: height === 256 ? 0 : height,
    colorCount: 0,
    planes: 0,
    bitCount: 32,
    bytes: makePng(width, height, marker),
  }));
}

function makeIco(frames: readonly FixtureFrame[]): Buffer {
  const directorySize = 6 + frames.length * 16;
  const directory = Buffer.alloc(directorySize);
  directory.writeUInt16LE(0, 0);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(frames.length, 4);
  let imageOffset = directorySize;
  frames.forEach((frame, index) => {
    const offset = 6 + index * 16;
    directory[offset] = frame.widthByte;
    directory[offset + 1] = frame.heightByte;
    directory[offset + 2] = frame.colorCount;
    directory[offset + 3] = 0;
    directory.writeUInt16LE(frame.planes, offset + 4);
    directory.writeUInt16LE(frame.bitCount, offset + 6);
    directory.writeUInt32LE(frame.bytes.length, offset + 8);
    directory.writeUInt32LE(imageOffset, offset + 12);
    imageOffset += frame.bytes.length;
  });
  return Buffer.concat([directory, ...frames.map(({ bytes }) => bytes)]);
}

function groupFrames(
  frames: readonly FixtureFrame[],
  resourceIds = [11, 37, 90],
): readonly GroupFrame[] {
  return frames.map((frame, index) => ({
    ...frame,
    size: frame.bytes.length,
    resourceId: resourceIds[index],
  }));
}

function makeGroupIcon(frames: readonly GroupFrame[]): Buffer {
  const bytes = Buffer.alloc(6 + frames.length * 14);
  bytes.writeUInt16LE(0, 0);
  bytes.writeUInt16LE(1, 2);
  bytes.writeUInt16LE(frames.length, 4);
  frames.forEach((frame, index) => {
    const offset = 6 + index * 14;
    bytes[offset] = frame.widthByte;
    bytes[offset + 1] = frame.heightByte;
    bytes[offset + 2] = frame.colorCount;
    bytes[offset + 3] = 0;
    bytes.writeUInt16LE(frame.planes, offset + 4);
    bytes.writeUInt16LE(frame.bitCount, offset + 6);
    bytes.writeUInt32LE(frame.size, offset + 8);
    bytes.writeUInt16LE(frame.resourceId, offset + 12);
  });
  return bytes;
}

function directory(children: ResourceChild[]): ResourceDirectory {
  return {
    kind: "directory",
    children: children.sort((left, right) => {
      if (left.name !== undefined && right.name !== undefined) {
        return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
      }
      if (left.name !== undefined) return -1;
      if (right.name !== undefined) return 1;
      return left.id! - right.id!;
    }),
  };
}

function leaf(bytes: Buffer): ResourceLeaf {
  return { kind: "leaf", bytes: Buffer.from(bytes) };
}

function groupByResourceId<
  T extends { resourceId: number; languageId: number },
>(
  definitions: readonly T[],
  payload: (definition: T) => Buffer,
): ResourceDirectory {
  const byId = new Map<number, T[]>();
  for (const definition of definitions) {
    const values = byId.get(definition.resourceId) ?? [];
    values.push(definition);
    byId.set(definition.resourceId, values);
  }
  return directory(
    [...byId.entries()].map(([resourceId, languages]) => ({
      id: resourceId,
      node: directory(
        languages.map((definition) => ({
          id: definition.languageId,
          node: leaf(payload(definition)),
        })),
      ),
    })),
  );
}

function makeResourceBlob(
  groups: readonly GroupDefinition[],
  icons: readonly IconDefinition[],
  extraRootChildren: ResourceChild[],
): { bytes: Buffer; root: ResourceDirectory } {
  const root = directory([
    ...extraRootChildren,
    ...(icons.length > 0
      ? [
          {
            id: 3,
            node: groupByResourceId(icons, ({ bytes }) => bytes),
          },
        ]
      : []),
    ...(groups.length > 0
      ? [
          {
            id: 14,
            node: groupByResourceId(groups, ({ frames }) =>
              makeGroupIcon(frames),
            ),
          },
        ]
      : []),
  ]);
  const leaves: ResourceLeaf[] = [];
  const namedChildren: ResourceChild[] = [];
  let cursor = 0;
  function assignDirectories(node: ResourceNode): void {
    if (node.kind === "leaf") {
      leaves.push(node);
      return;
    }
    node.offset = cursor;
    cursor = align(cursor + 16 + node.children.length * 8, 4);
    for (const child of node.children) {
      if (child.name !== undefined) namedChildren.push(child);
      assignDirectories(child.node);
    }
  }
  assignDirectories(root);
  for (const child of namedChildren) {
    child.nameOffset = cursor;
    cursor += 2 + child.name!.length * 2;
  }
  cursor = align(cursor, 4);
  for (const resourceLeaf of leaves) {
    resourceLeaf.dataEntryOffset = cursor;
    cursor += 16;
  }
  for (const resourceLeaf of leaves) {
    cursor = align(cursor, 4);
    resourceLeaf.payloadOffset = cursor;
    cursor += resourceLeaf.bytes.length;
  }
  const bytes = Buffer.alloc(cursor);
  for (const child of namedChildren) {
    bytes.writeUInt16LE(child.name!.length, child.nameOffset!);
    bytes.write(child.name!, child.nameOffset! + 2, "utf16le");
  }
  function writeDirectory(node: ResourceNode): void {
    if (node.kind === "leaf") return;
    const offset = node.offset!;
    const namedCount = node.children.filter(
      (child) => child.name !== undefined,
    ).length;
    bytes.writeUInt16LE(namedCount, offset + 12);
    bytes.writeUInt16LE(node.children.length - namedCount, offset + 14);
    node.children.forEach((child, index) => {
      const entryOffset = offset + 16 + index * 8;
      bytes.writeUInt32LE(
        child.name !== undefined ? 0x8000_0000 + child.nameOffset! : child.id!,
        entryOffset,
      );
      const target =
        child.node.kind === "directory"
          ? 0x8000_0000 + child.node.offset!
          : child.node.dataEntryOffset!;
      if (child.node.kind === "leaf") {
        child.node.directoryEntryOffset = entryOffset;
      }
      bytes.writeUInt32LE(target, entryOffset + 4);
      writeDirectory(child.node);
    });
  }
  writeDirectory(root);
  for (const resourceLeaf of leaves) {
    bytes.writeUInt32LE(
      RESOURCE_RVA + resourceLeaf.payloadOffset!,
      resourceLeaf.dataEntryOffset!,
    );
    bytes.writeUInt32LE(
      resourceLeaf.bytes.length,
      resourceLeaf.dataEntryOffset! + 4,
    );
    resourceLeaf.bytes.copy(bytes, resourceLeaf.payloadOffset!);
  }
  return { bytes, root };
}

function makePe(
  groups: readonly GroupDefinition[],
  icons: readonly IconDefinition[],
  extraRootChildren: ResourceChild[] = [],
): PeFixture {
  const resource = makeResourceBlob(groups, icons, extraRootChildren);
  const peOffset = 0x80;
  const optionalHeaderOffset = peOffset + 24;
  const optionalHeaderSize = 0xe0;
  const sectionHeaderOffset = optionalHeaderOffset + optionalHeaderSize;
  const rawSize = align(resource.bytes.length, 0x200);
  const bytes = Buffer.alloc(RESOURCE_FILE_OFFSET + rawSize);
  bytes.write("MZ", 0, "ascii");
  bytes.writeUInt32LE(peOffset, 0x3c);
  bytes.write("PE\0\0", peOffset, "binary");
  bytes.writeUInt16LE(0x014c, peOffset + 4);
  bytes.writeUInt16LE(1, peOffset + 6);
  bytes.writeUInt16LE(optionalHeaderSize, peOffset + 20);
  bytes.writeUInt16LE(0x010b, optionalHeaderOffset);
  bytes.writeUInt32LE(RESOURCE_FILE_OFFSET, optionalHeaderOffset + 60);
  bytes.writeUInt32LE(16, optionalHeaderOffset + 92);
  const resourceDirectoryEntryOffset = optionalHeaderOffset + 96 + 2 * 8;
  bytes.writeUInt32LE(RESOURCE_RVA, resourceDirectoryEntryOffset);
  bytes.writeUInt32LE(resource.bytes.length, resourceDirectoryEntryOffset + 4);
  bytes.write(".rsrc\0\0\0", sectionHeaderOffset, "binary");
  bytes.writeUInt32LE(resource.bytes.length, sectionHeaderOffset + 8);
  bytes.writeUInt32LE(RESOURCE_RVA, sectionHeaderOffset + 12);
  bytes.writeUInt32LE(rawSize, sectionHeaderOffset + 16);
  bytes.writeUInt32LE(RESOURCE_FILE_OFFSET, sectionHeaderOffset + 20);
  bytes.writeUInt32LE(0x4000_0040, sectionHeaderOffset + 36);
  resource.bytes.copy(bytes, RESOURCE_FILE_OFFSET);
  return {
    bytes,
    resourceRoot: resource.root,
    resourceDirectoryEntryOffset,
    resourceSectionHeaderOffset: sectionHeaderOffset,
    resourceSize: resource.bytes.length,
  };
}

function resourceLeaves(root: ResourceDirectory): ResourceLeaf[] {
  const leaves: ResourceLeaf[] = [];
  function visit(node: ResourceNode): void {
    if (node.kind === "leaf") {
      leaves.push(node);
      return;
    }
    for (const child of node.children) visit(child.node);
  }
  visit(root);
  return leaves;
}

function defaultFixture() {
  const frames = makeFrames();
  const groupedFrames = groupFrames(frames);
  const groups: GroupDefinition[] = [
    { resourceId: 103, languageId: 1033, frames: groupedFrames },
  ];
  const icons: IconDefinition[] = groupedFrames.map((frame) => ({
    resourceId: frame.resourceId,
    languageId: 1033,
    bytes: frame.bytes,
  }));
  return { frames, ico: makeIco(frames), groupedFrames, groups, icons };
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
  }
});

describe("Windows setup PE icon verifier", () => {
  it("parses the repository canonical ICO and its exact generated inventory", () => {
    const frames = parseCanonicalIco(readFileSync(CANONICAL_ICO));
    expect(
      frames.map(({ width, height, bitCount }) => ({
        width,
        height,
        bitCount,
      })),
    ).toEqual([
      { width: 32, height: 32, bitCount: 32 },
      { width: 16, height: 16, bitCount: 32 },
      { width: 24, height: 24, bitCount: 32 },
      { width: 48, height: 48, bitCount: 32 },
      { width: 64, height: 64, bitCount: 32 },
      { width: 256, height: 256, bitCount: 32 },
    ]);
  });

  it("locks resource leaf payload extraction to zero-copy subarray views", () => {
    const source = readFileSync(SCRIPT, "utf8");
    expect(() => assertZeroCopyLeafPayloadSource(source)).not.toThrow();

    const zeroCopy =
      "bytes: buffer.subarray(mapped.fileOffset, mapped.fileOffset + size),";
    const copying =
      "bytes: Buffer.from(buffer.subarray(mapped.fileOffset, mapped.fileOffset + size)),";
    const mutated = source.replace(zeroCopy, `${copying}\n// ${zeroCopy}`);
    expect(mutated).not.toBe(source);
    expect(() => assertZeroCopyLeafPayloadSource(mutated)).toThrow(
      /exactly one zero-copy payload subarray/u,
    );
  });

  it("accepts exactly one group whose IDs, metadata, and raw frames match", () => {
    const fixture = defaultFixture();
    const pe = makePe(fixture.groups, fixture.icons);
    expect(verifyWindowsSetupIconBytes(pe.bytes, fixture.ico)).toEqual({
      groupResourceId: 103,
      languageId: 1033,
      frames: fixture.groupedFrames.map((frame) => ({
        resourceId: frame.resourceId,
        width: frame.width,
        height: frame.height,
        bitCount: frame.bitCount,
        size: frame.size,
      })),
    });
  });

  it("requires strict numeric ordering in every PE resource directory", () => {
    const fixture = defaultFixture();
    const pe = makePe(fixture.groups, fixture.icons);
    const firstEntry = RESOURCE_FILE_OFFSET + 16;
    const secondEntry = firstEntry + 8;
    const firstId = pe.bytes.readUInt32LE(firstEntry);
    const secondId = pe.bytes.readUInt32LE(secondEntry);

    const reversed = Buffer.from(pe.bytes);
    reversed.writeUInt32LE(secondId, firstEntry);
    reversed.writeUInt32LE(firstId, secondEntry);
    expect(() => verifyWindowsSetupIconBytes(reversed, fixture.ico)).toThrow(
      /not in strict numeric order/u,
    );

    const equal = Buffer.from(pe.bytes);
    equal.writeUInt32LE(firstId, secondEntry);
    expect(() => verifyWindowsSetupIconBytes(equal, fixture.ico)).toThrow(
      /duplicate key/u,
    );
  });

  it("requires strict case-sensitive string ordering in the named partition", () => {
    const fixture = defaultFixture();
    const pe = makePe(fixture.groups, fixture.icons, [
      { name: "alpha", node: leaf(Buffer.from([0xa1])) },
      { name: "Zed", node: leaf(Buffer.from([0xa2])) },
    ]);
    expect(() =>
      verifyWindowsSetupIconBytes(pe.bytes, fixture.ico),
    ).not.toThrow();

    const firstEntry = RESOURCE_FILE_OFFSET + 16;
    const secondEntry = firstEntry + 8;
    const firstName = pe.bytes.readUInt32LE(firstEntry);
    const secondName = pe.bytes.readUInt32LE(secondEntry);
    const reversed = Buffer.from(pe.bytes);
    reversed.writeUInt32LE(secondName, firstEntry);
    reversed.writeUInt32LE(firstName, secondEntry);
    expect(() => verifyWindowsSetupIconBytes(reversed, fixture.ico)).toThrow(
      /not in strict case-sensitive string order/u,
    );

    const equal = Buffer.from(pe.bytes);
    equal.writeUInt32LE(firstName, secondEntry);
    expect(() => verifyWindowsSetupIconBytes(equal, fixture.ico)).toThrow(
      /duplicate key/u,
    );
  });

  it("rejects cumulative named resource strings beyond the global budget", () => {
    const fixture = defaultFixture();
    const namedLeaves = Array.from({ length: 257 }, (_, index) => ({
      name: `${index.toString(16).padStart(4, "0")}${"x".repeat(4_092)}`,
      node: leaf(Buffer.from([index & 0xff])),
    }));
    expect(() =>
      verifyWindowsSetupIconBytes(
        makePe(fixture.groups, fixture.icons, namedLeaves).bytes,
        fixture.ico,
      ),
    ).toThrow(/resource names exceed the global parse budget/u);
  });

  it("runs as a two-path CLI and fails closed on usage", () => {
    const fixture = defaultFixture();
    const root = temporaryDirectory();
    const setupPath = path.join(root, "FyAgent-setup.exe");
    const icoPath = path.join(root, "icon.ico");
    writeFileSync(setupPath, makePe(fixture.groups, fixture.icons).bytes);
    writeFileSync(icoPath, fixture.ico);
    expect(
      execFileSync(process.execPath, [SCRIPT, setupPath, icoPath], {
        encoding: "utf8",
      }),
    ).toMatch(/exactly one canonical FyAgent icon group with 3 frames/u);

    const rejected = spawnSync(process.execPath, [SCRIPT, setupPath], {
      encoding: "utf8",
    });
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toMatch(
      /Usage: node .* <setup\.exe> <canonical\.ico>/u,
    );
  });

  it("rejects an oversized canonical ICO file before reading it", () => {
    const fixture = defaultFixture();
    const root = temporaryDirectory();
    const setupPath = path.join(root, "FyAgent-setup.exe");
    const icoPath = path.join(root, "oversized.ico");
    writeFileSync(setupPath, makePe(fixture.groups, fixture.icons).bytes);
    writeFileSync(icoPath, Buffer.alloc(0));
    truncateSync(icoPath, 16 * 1024 * 1024 + 1);

    const rejected = spawnSync(process.execPath, [SCRIPT, setupPath, icoPath], {
      encoding: "utf8",
    });
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toMatch(/Canonical ICO size is invalid/u);
  });

  it("rejects a missing, extra, or default icon group", () => {
    const fixture = defaultFixture();
    expect(() =>
      verifyWindowsSetupIconBytes(makePe([], fixture.icons).bytes, fixture.ico),
    ).toThrow(/exactly one RT_GROUP_ICON resource/u);
    const defaultGroup: GroupDefinition = {
      resourceId: 1,
      languageId: 1033,
      frames: fixture.groupedFrames.map((frame) => ({
        ...frame,
        bytes: Buffer.from(frame.bytes).fill(0x44, 40, 41),
      })),
    };
    expect(() =>
      verifyWindowsSetupIconBytes(
        makePe([...fixture.groups, defaultGroup], fixture.icons).bytes,
        fixture.ico,
      ),
    ).toThrow(/extra, missing, or default icon groups are forbidden/u);
  });

  it("rejects extra, missing, and unreferenced RT_ICON leaves", () => {
    const fixture = defaultFixture();
    expect(() =>
      verifyWindowsSetupIconBytes(
        makePe(fixture.groups, fixture.icons.slice(0, -1)).bytes,
        fixture.ico,
      ),
    ).toThrow(/exactly the RT_ICON frames/u);
    expect(() =>
      verifyWindowsSetupIconBytes(
        makePe(fixture.groups, [
          ...fixture.icons,
          { resourceId: 99, languageId: 1033, bytes: makePng(48, 48, 0x99) },
        ]).bytes,
        fixture.ico,
      ),
    ).toThrow(/exactly the RT_ICON frames/u);

    const changedIds = fixture.groupedFrames.map((frame, index) =>
      index === 1 ? { ...frame, resourceId: 99 } : frame,
    );
    expect(() =>
      verifyWindowsSetupIconBytes(
        makePe([{ ...fixture.groups[0], frames: changedIds }], fixture.icons)
          .bytes,
        fixture.ico,
      ),
    ).toThrow(/missing RT_ICON resource ID 99/u);
  });

  it("rejects dimension, bit-depth, and size metadata drift", () => {
    const fixture = defaultFixture();
    const mutations: Array<[Partial<GroupFrame>, RegExp]> = [
      [{ widthByte: 48, width: 48 }, /dimensions do not match/u],
      [{ bitCount: 24 }, /bit depth does not match/u],
      [{ size: fixture.groupedFrames[0].size + 1 }, /size does not match/u],
    ];
    for (const [change, expected] of mutations) {
      const changedFrames = fixture.groupedFrames.map((frame, index) =>
        index === 0 ? { ...frame, ...change } : frame,
      );
      expect(() =>
        verifyWindowsSetupIconBytes(
          makePe(
            [{ ...fixture.groups[0], frames: changedFrames }],
            fixture.icons,
          ).bytes,
          fixture.ico,
        ),
      ).toThrow(expected);
    }
  });

  it("rejects a byte-different embedded frame even when metadata matches", () => {
    const fixture = defaultFixture();
    const changedBytes = Buffer.from(fixture.icons[1].bytes);
    changedBytes[changedBytes.length - 1] ^= 0xff;
    const changedIcons = fixture.icons.map((icon, index) =>
      index === 1 ? { ...icon, bytes: changedBytes } : icon,
    );
    expect(() =>
      verifyWindowsSetupIconBytes(
        makePe(fixture.groups, changedIcons).bytes,
        fixture.ico,
      ),
    ).toThrow(/bytes do not match the canonical ICO frame/u);
  });

  it("rejects group/icon language drift and duplicate language variants", () => {
    const fixture = defaultFixture();
    const changedIcons = fixture.icons.map((icon, index) =>
      index === 0 ? { ...icon, languageId: 0 } : icon,
    );
    expect(() =>
      verifyWindowsSetupIconBytes(
        makePe(fixture.groups, changedIcons).bytes,
        fixture.ico,
      ),
    ).toThrow(/RT_ICON language does not match/u);
    expect(() =>
      verifyWindowsSetupIconBytes(
        makePe(
          [...fixture.groups, { ...fixture.groups[0], languageId: 0 }],
          fixture.icons,
        ).bytes,
        fixture.ico,
      ),
    ).toThrow(/exactly one RT_GROUP_ICON resource/u);
  });

  it("rejects malformed canonical ICO ranges and frame metadata", () => {
    const fixture = defaultFixture();
    expect(() =>
      parseCanonicalIco(Buffer.concat([fixture.ico, Buffer.from([0])])),
    ).toThrow(/trailing bytes/u);

    const overlapping = Buffer.from(fixture.ico);
    overlapping.writeUInt32LE(6, 6 + 12);
    expect(() => parseCanonicalIco(overlapping)).toThrow(
      /overlaps the ICO directory/u,
    );

    const wrongWidth = Buffer.from(fixture.ico);
    wrongWidth[6] = 24;
    expect(() => parseCanonicalIco(wrongWidth)).toThrow(
      /PNG dimensions do not match/u,
    );
  });

  it("rejects high-bit PNG chunk types through the complete verifier", () => {
    const fixture = defaultFixture();
    for (const chunkType of ["IHDR", "IDAT", "IEND"]) {
      const changedFrames = fixture.frames.map((frame, index) =>
        index === 0
          ? { ...frame, bytes: highBitChunkType(frame.bytes, chunkType) }
          : frame,
      );
      const changedGroupedFrames = groupFrames(changedFrames);
      const changedGroups: GroupDefinition[] = [
        {
          resourceId: 103,
          languageId: 1033,
          frames: changedGroupedFrames,
        },
      ];
      const changedIcons: IconDefinition[] = changedGroupedFrames.map(
        (frame) => ({
          resourceId: frame.resourceId,
          languageId: 1033,
          bytes: frame.bytes,
        }),
      );
      expect(() =>
        verifyWindowsSetupIconBytes(
          makePe(changedGroups, changedIcons).bytes,
          makeIco(changedFrames),
        ),
      ).toThrow(/PNG chunk type is malformed/u);
    }
  });

  it("rejects PE section and declared resource bounds drift", () => {
    const fixture = defaultFixture();
    const pe = makePe(fixture.groups, fixture.icons);
    const oversized = Buffer.from(pe.bytes);
    oversized.writeUInt32LE(0x4000, pe.resourceDirectoryEntryOffset + 4);
    expect(() => verifyWindowsSetupIconBytes(oversized, fixture.ico)).toThrow(
      /must map to exactly one raw-backed PE section/u,
    );

    const shortSection = Buffer.from(pe.bytes);
    shortSection.writeUInt32LE(
      pe.resourceSize - 1,
      pe.resourceSectionHeaderOffset + 16,
    );
    expect(() =>
      verifyWindowsSetupIconBytes(shortSection, fixture.ico),
    ).toThrow(/must map to exactly one raw-backed PE section/u);
  });

  it("rejects cyclic and out-of-range resource directory targets", () => {
    const fixture = defaultFixture();
    const pe = makePe(fixture.groups, fixture.icons);
    const firstRootTarget = RESOURCE_FILE_OFFSET + 16 + 4;
    const cyclic = Buffer.from(pe.bytes);
    cyclic.writeUInt32LE(0x8000_0000, firstRootTarget);
    expect(() => verifyWindowsSetupIconBytes(cyclic, fixture.ico)).toThrow(
      /cyclic or reused/u,
    );

    const outOfRange = Buffer.from(pe.bytes);
    outOfRange.writeUInt32LE(
      0x8000_0000 + align(pe.resourceSize, 4),
      firstRootTarget,
    );
    expect(() => verifyWindowsSetupIconBytes(outOfRange, fixture.ico)).toThrow(
      /outside the declared PE resource directory/u,
    );
  });

  it("rejects a second leaf that reuses the first data-entry record", () => {
    const fixture = defaultFixture();
    const pe = makePe(fixture.groups, fixture.icons);
    const leaves = resourceLeaves(pe.resourceRoot);
    const reused = Buffer.from(pe.bytes);
    reused.writeUInt32LE(
      leaves[0].dataEntryOffset!,
      RESOURCE_FILE_OFFSET + leaves[1].directoryEntryOffset! + 4,
    );
    expect(() => verifyWindowsSetupIconBytes(reused, fixture.ico)).toThrow(
      /resource data entry is reused/u,
    );
  });

  it("rejects distinct data entries whose payloads alias or overlap", () => {
    const fixture = defaultFixture();
    const pe = makePe(fixture.groups, fixture.icons);
    const leaves = resourceLeaves(pe.resourceRoot);
    const firstEntry = RESOURCE_FILE_OFFSET + leaves[0].dataEntryOffset!;
    const secondEntry = RESOURCE_FILE_OFFSET + leaves[1].dataEntryOffset!;
    const firstRva = pe.bytes.readUInt32LE(firstEntry);
    const firstSize = pe.bytes.readUInt32LE(firstEntry + 4);

    const aliased = Buffer.from(pe.bytes);
    aliased.writeUInt32LE(firstRva, secondEntry);
    aliased.writeUInt32LE(firstSize, secondEntry + 4);
    expect(() => verifyWindowsSetupIconBytes(aliased, fixture.ico)).toThrow(
      /payloads overlap or alias/u,
    );

    const overlapping = Buffer.from(pe.bytes);
    overlapping.writeUInt32LE(firstRva + 4, secondEntry);
    overlapping.writeUInt32LE(firstSize, secondEntry + 4);
    expect(() => verifyWindowsSetupIconBytes(overlapping, fixture.ico)).toThrow(
      /payloads overlap or alias/u,
    );
  });

  it("bounds global resource directory, entry, and leaf work", () => {
    const fixture = defaultFixture();
    const tooManyDirectories = Array.from({ length: 2_042 }, (_, index) => ({
      id: 100 + index,
      node: directory([{ id: 1, node: leaf(Buffer.from([index & 0xff])) }]),
    }));
    expect(() =>
      verifyWindowsSetupIconBytes(
        makePe(fixture.groups, fixture.icons, tooManyDirectories).bytes,
        fixture.ico,
      ),
    ).toThrow(/too many directories/u);

    const tooManyEntries = Array.from({ length: 8_191 }, (_, index) => ({
      id: 100 + index,
      node: leaf(Buffer.from([index & 0xff])),
    }));
    expect(() =>
      verifyWindowsSetupIconBytes(
        makePe(fixture.groups, fixture.icons, tooManyEntries).bytes,
        fixture.ico,
      ),
    ).toThrow(/too many entries/u);

    const tooManyLeaves = Array.from({ length: 4_093 }, (_, index) => ({
      id: 100 + index,
      node: leaf(Buffer.from([index & 0xff])),
    }));
    expect(() =>
      verifyWindowsSetupIconBytes(
        makePe(fixture.groups, fixture.icons, tooManyLeaves).bytes,
        fixture.ico,
      ),
    ).toThrow(/too many leaves/u);
  });

  it("bounds setup, resource-directory, and cumulative payload bytes", () => {
    const fixture = defaultFixture();
    const pe = makePe(fixture.groups, fixture.icons);
    const oversizedResource = Buffer.from(pe.bytes);
    oversizedResource.writeUInt32LE(
      64 * 1024 * 1024 + 1,
      pe.resourceDirectoryEntryOffset + 4,
    );
    expect(() =>
      verifyWindowsSetupIconBytes(oversizedResource, fixture.ico),
    ).toThrow(/resource directory exceeds .* parse budget/u);

    const payloadHeavy = makePe(fixture.groups, fixture.icons, [
      { id: 99, node: leaf(Buffer.alloc(16 * 1024 * 1024 + 1)) },
    ]);
    expect(() =>
      verifyWindowsSetupIconBytes(payloadHeavy.bytes, fixture.ico),
    ).toThrow(/payloads exceed the global parse budget/u);

    const root = temporaryDirectory();
    const setupPath = path.join(root, "oversized-setup.exe");
    writeFileSync(setupPath, Buffer.alloc(0));
    truncateSync(setupPath, 512 * 1024 * 1024 + 1);
    const rejected = spawnSync(
      process.execPath,
      [SCRIPT, setupPath, CANONICAL_ICO],
      { encoding: "utf8" },
    );
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toMatch(/Windows setup size is invalid/u);
  });

  it("counts distinct sub-limit payloads against the cumulative budget", () => {
    const fixture = defaultFixture();
    const payloadHeavy = makePe(fixture.groups, fixture.icons, [
      { id: 98, node: leaf(Buffer.alloc(8 * 1024 * 1024)) },
      { id: 99, node: leaf(Buffer.alloc(8 * 1024 * 1024)) },
    ]);
    expect(() =>
      verifyWindowsSetupIconBytes(payloadHeavy.bytes, fixture.ico),
    ).toThrow(/payloads exceed the global parse budget/u);
  });

  it("rejects duplicate group frame IDs before byte matching", () => {
    const fixture = defaultFixture();
    const duplicateIds = fixture.groupedFrames.map((frame, index) =>
      index === 1
        ? { ...frame, resourceId: fixture.groupedFrames[0].resourceId }
        : frame,
    );
    expect(() =>
      verifyWindowsSetupIconBytes(
        makePe([{ ...fixture.groups[0], frames: duplicateIds }], fixture.icons)
          .bytes,
        fixture.ico,
      ),
    ).toThrow(/frame IDs must be non-zero and unique/u);
  });

  it("keeps typed canonical frame bytes available for exact comparisons", () => {
    const fixture = defaultFixture();
    const frames: readonly CanonicalIconFrame[] = parseCanonicalIco(
      fixture.ico,
    );
    expect(frames.map(({ bytes }) => bytes.equals(Buffer.from(bytes)))).toEqual(
      [true, true, true],
    );
  });
});
