#!/usr/bin/env node

import {
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RT_ICON = 3;
const RT_GROUP_ICON = 14;
// Observed NSIS output is about 10 MiB with under 100 KiB of resources and
// fewer than 30 directories, 50 entries, and 25 leaves; these ceilings retain
// at least 50x structural/byte headroom while bounding untrusted parse work.
const MAX_ICON_FRAMES = 256;
const MAX_SETUP_BYTES = 512 * 1024 * 1024;
const MAX_CANONICAL_ICO_BYTES = 16 * 1024 * 1024;
const MAX_RESOURCE_BYTES = 64 * 1024 * 1024;
const MAX_RESOURCE_DEPTH = 8;
const MAX_RESOURCE_DIRECTORIES = 2_048;
const MAX_RESOURCE_ENTRIES = 8_192;
const MAX_RESOURCE_LEAVES = 4_096;
const MAX_RESOURCE_NAME_CODE_UNITS = 1024 * 1024;
const MAX_RESOURCE_PAYLOAD_BYTES = 16 * 1024 * 1024;
const SUPPORTED_PE_MACHINES = new Set([0x014c, 0x8664, 0xaa64]);
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertRange(totalLength, offset, size, label) {
  assert(
    Number.isSafeInteger(offset) && Number.isSafeInteger(size),
    `${label} range is not a safe integer`,
  );
  assert(offset >= 0 && size >= 0, `${label} range is negative`);
  assert(
    offset <= totalLength && size <= totalLength - offset,
    `${label} is outside its containing bytes`,
  );
}

function normalizedIconDimension(value) {
  return value === 0 ? 256 : value;
}

function assertPngFrame(frame, expectedWidth, expectedHeight, bitCount, label) {
  assert(
    frame.length >= 45 && frame.subarray(0, 8).equals(PNG_SIGNATURE),
    `${label} is not a complete PNG frame`,
  );

  let cursor = 8;
  let chunkIndex = 0;
  let sawIdat = false;
  let sawIend = false;
  let width;
  let height;
  let effectiveBitCount;
  while (cursor < frame.length) {
    assertRange(frame.length, cursor, 12, `${label} PNG chunk header`);
    const dataLength = frame.readUInt32BE(cursor);
    const chunkLength = 12 + dataLength;
    assertRange(frame.length, cursor, chunkLength, `${label} PNG chunk`);
    assert(
      frame
        .subarray(cursor + 4, cursor + 8)
        .every(
          (byte) =>
            (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a),
        ),
      `${label} PNG chunk type is malformed`,
    );
    const chunkType = frame.toString("latin1", cursor + 4, cursor + 8);
    if (chunkIndex === 0) {
      assert(
        chunkType === "IHDR" && dataLength === 13,
        `${label} PNG must begin with one complete IHDR chunk`,
      );
      width = frame.readUInt32BE(cursor + 8);
      height = frame.readUInt32BE(cursor + 12);
      const bitDepth = frame[cursor + 16];
      const colorType = frame[cursor + 17];
      const allowedDepths = {
        0: new Set([1, 2, 4, 8, 16]),
        2: new Set([8, 16]),
        3: new Set([1, 2, 4, 8]),
        4: new Set([8, 16]),
        6: new Set([8, 16]),
      };
      const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
      assert(
        allowedDepths[colorType]?.has(bitDepth),
        `${label} PNG bit depth and color type are unsupported`,
      );
      assert(
        frame[cursor + 18] === 0 &&
          frame[cursor + 19] === 0 &&
          (frame[cursor + 20] === 0 || frame[cursor + 20] === 1),
        `${label} PNG compression, filter, or interlace method is invalid`,
      );
      effectiveBitCount = bitDepth * channels[colorType];
    } else {
      assert(chunkType !== "IHDR", `${label} PNG contains an extra IHDR`);
    }
    if (chunkType === "IDAT") sawIdat = true;
    if (chunkType === "IEND") {
      assert(dataLength === 0, `${label} PNG IEND chunk must be empty`);
      assert(
        cursor + chunkLength === frame.length,
        `${label} PNG has bytes after IEND`,
      );
      sawIend = true;
    } else {
      assert(!sawIend, `${label} PNG has a chunk after IEND`);
    }
    cursor += chunkLength;
    chunkIndex += 1;
  }

  assert(sawIdat && sawIend, `${label} PNG must contain IDAT and IEND`);
  assert(
    width === expectedWidth && height === expectedHeight,
    `${label} PNG dimensions do not match its ICO directory entry`,
  );
  assert(
    effectiveBitCount === bitCount,
    `${label} PNG bit depth does not match its ICO directory entry`,
  );
}

function assertDibFrame(
  frame,
  expectedWidth,
  expectedHeight,
  planes,
  bitCount,
  label,
) {
  assertRange(frame.length, 0, 16, `${label} DIB header`);
  const headerSize = frame.readUInt32LE(0);
  assert(
    headerSize >= 40 && headerSize <= frame.length,
    `${label} has an unsupported or truncated DIB header`,
  );
  const width = frame.readInt32LE(4);
  const combinedHeight = frame.readInt32LE(8);
  assert(
    width > 0 && combinedHeight > 0 && combinedHeight % 2 === 0,
    `${label} DIB dimensions are invalid`,
  );
  assert(
    width === expectedWidth && combinedHeight / 2 === expectedHeight,
    `${label} DIB dimensions do not match its ICO directory entry`,
  );
  assert(
    frame.readUInt16LE(12) === planes && frame.readUInt16LE(14) === bitCount,
    `${label} DIB planes or bit depth do not match its ICO directory entry`,
  );
}

export function parseCanonicalIco(buffer) {
  assert(Buffer.isBuffer(buffer), "Canonical ICO bytes must be a Buffer");
  assert(
    buffer.length <= MAX_CANONICAL_ICO_BYTES,
    `Canonical ICO exceeds the ${MAX_CANONICAL_ICO_BYTES}-byte parse budget`,
  );
  assertRange(buffer.length, 0, 6, "Canonical ICO header");
  assert(
    buffer.readUInt16LE(0) === 0 && buffer.readUInt16LE(2) === 1,
    "Canonical ICO header must identify an icon",
  );
  const count = buffer.readUInt16LE(4);
  assert(
    count > 0 && count <= MAX_ICON_FRAMES,
    `Canonical ICO frame count must be between 1 and ${MAX_ICON_FRAMES}`,
  );
  const directorySize = 6 + count * 16;
  assertRange(buffer.length, 0, directorySize, "Canonical ICO directory");

  const frames = [];
  const ranges = [];
  for (let index = 0; index < count; index += 1) {
    const entryOffset = 6 + index * 16;
    const widthByte = buffer[entryOffset];
    const heightByte = buffer[entryOffset + 1];
    const colorCount = buffer[entryOffset + 2];
    const reserved = buffer[entryOffset + 3];
    const planes = buffer.readUInt16LE(entryOffset + 4);
    const bitCount = buffer.readUInt16LE(entryOffset + 6);
    const size = buffer.readUInt32LE(entryOffset + 8);
    const imageOffset = buffer.readUInt32LE(entryOffset + 12);
    const label = `Canonical ICO frame ${index + 1}`;
    assert(reserved === 0, `${label} reserved byte must be zero`);
    assert(planes <= 1, `${label} planes value must be zero or one`);
    assert(bitCount > 0, `${label} bit depth must be non-zero`);
    assert(size > 0, `${label} must not be empty`);
    assert(imageOffset >= directorySize, `${label} overlaps the ICO directory`);
    assertRange(buffer.length, imageOffset, size, label);
    const bytes = buffer.subarray(imageOffset, imageOffset + size);
    const width = normalizedIconDimension(widthByte);
    const height = normalizedIconDimension(heightByte);
    if (bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
      assertPngFrame(bytes, width, height, bitCount, label);
    } else {
      assertDibFrame(bytes, width, height, planes, bitCount, label);
    }
    frames.push(
      Object.freeze({
        index,
        widthByte,
        heightByte,
        width,
        height,
        colorCount,
        planes,
        bitCount,
        size,
        bytes,
      }),
    );
    ranges.push({ start: imageOffset, end: imageOffset + size });
  }

  ranges.sort((left, right) => left.start - right.start);
  let cursor = directorySize;
  for (const range of ranges) {
    assert(
      range.start === cursor,
      "Canonical ICO frames must exactly cover the bytes after the directory without gaps or overlap",
    );
    cursor = range.end;
  }
  assert(
    cursor === buffer.length,
    "Canonical ICO contains unreferenced trailing bytes",
  );
  return Object.freeze(frames);
}

function parsePeResourceImage(buffer) {
  assert(Buffer.isBuffer(buffer), "Windows setup bytes must be a Buffer");
  assert(
    buffer.length <= MAX_SETUP_BYTES,
    `Windows setup exceeds the ${MAX_SETUP_BYTES}-byte parse budget`,
  );
  assert(buffer.length >= 64, "Windows setup is too small for a PE image");
  assert(
    buffer[0] === 0x4d && buffer[1] === 0x5a,
    "Windows setup is missing the DOS MZ signature",
  );
  const peOffset = buffer.readUInt32LE(0x3c);
  assert(
    peOffset >= 64 && peOffset <= buffer.length - 24,
    "Windows setup has an invalid PE header offset",
  );
  assert(
    buffer.subarray(peOffset, peOffset + 4).equals(Buffer.from("PE\0\0")),
    "Windows setup is missing the PE signature",
  );
  const machine = buffer.readUInt16LE(peOffset + 4);
  assert(
    SUPPORTED_PE_MACHINES.has(machine),
    "Windows setup has an unsupported PE Machine value",
  );
  const numberOfSections = buffer.readUInt16LE(peOffset + 6);
  assert(
    numberOfSections > 0 && numberOfSections <= 96,
    "Windows setup has an invalid PE section count",
  );
  const optionalHeaderSize = buffer.readUInt16LE(peOffset + 20);
  const optionalHeaderOffset = peOffset + 24;
  assertRange(
    buffer.length,
    optionalHeaderOffset,
    optionalHeaderSize,
    "Windows setup optional header",
  );
  const magic = buffer.readUInt16LE(optionalHeaderOffset);
  assert(
    magic === 0x10b || magic === 0x20b,
    "Windows setup has an unsupported PE optional-header format",
  );
  const directoryCountOffset =
    optionalHeaderOffset + (magic === 0x20b ? 108 : 92);
  const dataDirectoryOffset =
    optionalHeaderOffset + (magic === 0x20b ? 112 : 96);
  assert(
    directoryCountOffset + 4 <= optionalHeaderOffset + optionalHeaderSize,
    "Windows setup optional header omits the data-directory count",
  );
  assert(
    buffer.readUInt32LE(directoryCountOffset) >= 3,
    "Windows setup optional header omits the resource directory",
  );
  const resourceEntryOffset = dataDirectoryOffset + RT_ICON * 8 - 8;
  assert(
    resourceEntryOffset + 8 <= optionalHeaderOffset + optionalHeaderSize,
    "Windows setup resource directory is outside the optional header",
  );
  const resourceRva = buffer.readUInt32LE(resourceEntryOffset);
  const resourceSize = buffer.readUInt32LE(resourceEntryOffset + 4);
  assert(
    resourceRva > 0 && resourceSize >= 16,
    "Windows setup PE resource directory is missing or empty",
  );
  assert(
    resourceSize <= MAX_RESOURCE_BYTES,
    `Windows setup PE resource directory exceeds the ${MAX_RESOURCE_BYTES}-byte parse budget`,
  );
  assert(
    resourceRva + resourceSize <= 0x1_0000_0000,
    "Windows setup PE resource range overflows the RVA address space",
  );

  const sectionTableOffset = optionalHeaderOffset + optionalHeaderSize;
  const sectionTableSize = numberOfSections * 40;
  assertRange(
    buffer.length,
    sectionTableOffset,
    sectionTableSize,
    "Windows setup section table",
  );
  const sizeOfHeaders = buffer.readUInt32LE(optionalHeaderOffset + 60);
  assert(
    sizeOfHeaders >= sectionTableOffset + sectionTableSize &&
      sizeOfHeaders <= buffer.length,
    "Windows setup SizeOfHeaders does not contain the PE headers",
  );

  const sections = [];
  for (let index = 0; index < numberOfSections; index += 1) {
    const offset = sectionTableOffset + index * 40;
    const virtualSize = buffer.readUInt32LE(offset + 8);
    const virtualAddress = buffer.readUInt32LE(offset + 12);
    const rawSize = buffer.readUInt32LE(offset + 16);
    const rawOffset = buffer.readUInt32LE(offset + 20);
    assert(
      virtualAddress + Math.max(virtualSize, rawSize) <= 0x1_0000_0000,
      `Windows setup section ${index + 1} overflows the RVA address space`,
    );
    if (rawSize > 0) {
      assert(
        rawOffset >= sizeOfHeaders,
        `Windows setup section ${index + 1} raw data overlaps the PE headers`,
      );
      assertRange(
        buffer.length,
        rawOffset,
        rawSize,
        `Windows setup section ${index + 1} raw data`,
      );
    }
    sections.push({ index, virtualAddress, virtualSize, rawOffset, rawSize });
  }

  for (let leftIndex = 0; leftIndex < sections.length; leftIndex += 1) {
    const left = sections[leftIndex];
    if (left.rawSize === 0) continue;
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < sections.length;
      rightIndex += 1
    ) {
      const right = sections[rightIndex];
      if (right.rawSize === 0) continue;
      const rawOverlap =
        left.rawOffset < right.rawOffset + right.rawSize &&
        right.rawOffset < left.rawOffset + left.rawSize;
      const rvaOverlap =
        left.virtualAddress < right.virtualAddress + right.rawSize &&
        right.virtualAddress < left.virtualAddress + left.rawSize;
      assert(
        !rawOverlap && !rvaOverlap,
        "Windows setup contains overlapping raw-backed PE sections",
      );
    }
  }

  function mapRva(rva, size, label) {
    assert(
      Number.isInteger(rva) && Number.isInteger(size) && rva >= 0 && size >= 0,
      `${label} has an invalid RVA range`,
    );
    assert(
      rva + size <= 0x1_0000_0000,
      `${label} overflows the RVA address space`,
    );
    const matches = sections.filter(
      (section) =>
        size > 0 &&
        rva >= section.virtualAddress &&
        rva + size <= section.virtualAddress + section.rawSize,
    );
    assert(
      matches.length === 1,
      `${label} must map to exactly one raw-backed PE section`,
    );
    const section = matches[0];
    const fileOffset = section.rawOffset + (rva - section.virtualAddress);
    assertRange(buffer.length, fileOffset, size, label);
    return { fileOffset, section };
  }

  const mappedResource = mapRva(
    resourceRva,
    resourceSize,
    "Windows setup PE resource directory",
  );
  return {
    resourceRva,
    resourceSize,
    resourceOffset: mappedResource.fileOffset,
    mapRva,
  };
}

function parseResourceLeaves(buffer, pe) {
  const leaves = [];
  const visitedDirectories = new Set();
  const visitedDataEntries = new Set();
  const payloadIntervals = [];
  let totalEntries = 0;
  let totalNameCodeUnits = 0;
  let totalPayloadBytes = 0;

  function readResource(relativeOffset, size, label) {
    assert(
      relativeOffset <= pe.resourceSize &&
        size <= pe.resourceSize - relativeOffset,
      `${label} is outside the declared PE resource directory`,
    );
    const offset = pe.resourceOffset + relativeOffset;
    assertRange(buffer.length, offset, size, label);
    return offset;
  }

  function parseName(rawName, label) {
    if ((rawName & 0x8000_0000) === 0) {
      assert(
        (rawName & 0x7fff_0000) === 0,
        `${label} numeric resource ID has non-zero reserved bits`,
      );
      return Object.freeze({ kind: "id", id: rawName & 0xffff });
    }
    const relativeOffset = rawName & 0x7fff_ffff;
    assert(relativeOffset % 2 === 0, `${label} name offset is not aligned`);
    const stringOffset = readResource(relativeOffset, 2, `${label} name`);
    const length = buffer.readUInt16LE(stringOffset);
    assert(length <= 4096, `${label} name is unreasonably long`);
    totalNameCodeUnits += length;
    assert(
      totalNameCodeUnits <= MAX_RESOURCE_NAME_CODE_UNITS,
      "Windows setup PE resource names exceed the global parse budget",
    );
    readResource(relativeOffset, 2 + length * 2, `${label} name`);
    const value = buffer.toString(
      "utf16le",
      stringOffset + 2,
      stringOffset + 2 + length * 2,
    );
    assert(!value.includes("\0"), `${label} name contains a null character`);
    return Object.freeze({ kind: "name", name: value });
  }

  function walkDirectory(relativeOffset, pathEntries, depth) {
    assert(
      depth <= MAX_RESOURCE_DEPTH,
      "Windows setup PE resource tree is too deep",
    );
    assert(
      relativeOffset % 4 === 0,
      "Windows setup PE resource directory offset is not aligned",
    );
    assert(
      !visitedDirectories.has(relativeOffset),
      "Windows setup PE resource directory is cyclic or reused",
    );
    visitedDirectories.add(relativeOffset);
    assert(
      visitedDirectories.size <= MAX_RESOURCE_DIRECTORIES,
      "Windows setup PE resource tree has too many directories",
    );
    const directoryOffset = readResource(
      relativeOffset,
      16,
      "Windows setup PE resource directory header",
    );
    const namedCount = buffer.readUInt16LE(directoryOffset + 12);
    const idCount = buffer.readUInt16LE(directoryOffset + 14);
    const entryCount = namedCount + idCount;
    assert(entryCount > 0, "Windows setup PE resource directory is empty");
    totalEntries += entryCount;
    assert(
      totalEntries <= MAX_RESOURCE_ENTRIES,
      "Windows setup PE resource tree has too many entries",
    );
    const entriesOffset = readResource(
      relativeOffset + 16,
      entryCount * 8,
      "Windows setup PE resource directory entries",
    );
    const keys = new Set();
    let previousName;
    let previousId;
    for (let index = 0; index < entryCount; index += 1) {
      const entryOffset = entriesOffset + index * 8;
      const rawName = buffer.readUInt32LE(entryOffset);
      const rawTarget = buffer.readUInt32LE(entryOffset + 4);
      const isNamed = (rawName & 0x8000_0000) !== 0;
      assert(
        isNamed === index < namedCount,
        "Windows setup PE resource entries do not match named/ID counts",
      );
      const name = parseName(rawName, "Windows setup PE resource entry");
      const key = name.kind === "id" ? `id:${name.id}` : `name:${name.name}`;
      assert(
        !keys.has(key),
        "Windows setup PE resource directory contains a duplicate key",
      );
      keys.add(key);
      if (name.kind === "name") {
        assert(
          previousName === undefined || previousName < name.name,
          "Windows setup PE named resource entries are not in strict case-sensitive string order",
        );
        previousName = name.name;
      } else {
        assert(
          previousId === undefined || previousId < name.id,
          "Windows setup PE numeric resource entries are not in strict numeric order",
        );
        previousId = name.id;
      }
      const targetOffset = rawTarget & 0x7fff_ffff;
      assert(
        targetOffset % 4 === 0,
        "Windows setup PE resource target offset is not aligned",
      );
      const nextPath = [...pathEntries, name];
      if ((rawTarget & 0x8000_0000) !== 0) {
        walkDirectory(targetOffset, nextPath, depth + 1);
        continue;
      }

      assert(
        !visitedDataEntries.has(targetOffset),
        "Windows setup PE resource data entry is reused",
      );
      visitedDataEntries.add(targetOffset);
      const dataEntryOffset = readResource(
        targetOffset,
        16,
        "Windows setup PE resource data entry",
      );
      const dataRva = buffer.readUInt32LE(dataEntryOffset);
      const size = buffer.readUInt32LE(dataEntryOffset + 4);
      const codePage = buffer.readUInt32LE(dataEntryOffset + 8);
      const reserved = buffer.readUInt32LE(dataEntryOffset + 12);
      assert(size > 0, "Windows setup PE resource payload must not be empty");
      assert(
        leaves.length < MAX_RESOURCE_LEAVES,
        "Windows setup PE resource tree has too many leaves",
      );
      totalPayloadBytes += size;
      assert(
        totalPayloadBytes <= MAX_RESOURCE_PAYLOAD_BYTES,
        "Windows setup PE resource payloads exceed the global parse budget",
      );
      assert(
        reserved === 0,
        "Windows setup PE resource data-entry reserved field must be zero",
      );
      assert(
        dataRva >= pe.resourceRva &&
          dataRva + size <= pe.resourceRva + pe.resourceSize,
        "Windows setup PE resource payload is outside the declared resource range",
      );
      const mapped = pe.mapRva(
        dataRva,
        size,
        "Windows setup PE resource payload",
      );
      const expectedOffset = pe.resourceOffset + (dataRva - pe.resourceRva);
      assert(
        mapped.fileOffset === expectedOffset,
        "Windows setup PE resource payload mapping is inconsistent",
      );
      payloadIntervals.push({
        start: mapped.fileOffset,
        end: mapped.fileOffset + size,
      });
      leaves.push(
        Object.freeze({
          path: Object.freeze(nextPath),
          codePage,
          dataRva,
          bytes: buffer.subarray(mapped.fileOffset, mapped.fileOffset + size),
        }),
      );
    }
  }

  walkDirectory(0, [], 0);
  payloadIntervals.sort((left, right) => left.start - right.start);
  for (let index = 1; index < payloadIntervals.length; index += 1) {
    assert(
      payloadIntervals[index - 1].end <= payloadIntervals[index].start,
      "Windows setup PE resource payloads overlap or alias",
    );
  }
  return Object.freeze(leaves);
}

function numericIconLeaf(leaf, typeId, label) {
  const type = leaf.path[0];
  if (type?.kind !== "id" || type.id !== typeId) return null;
  assert(
    leaf.path.length === 3 &&
      leaf.path[1]?.kind === "id" &&
      leaf.path[2]?.kind === "id",
    `${label} resources must use numeric type/name/language IDs at exactly three levels`,
  );
  return {
    resourceId: leaf.path[1].id,
    languageId: leaf.path[2].id,
    bytes: leaf.bytes,
  };
}

function parseGroupIcon(bytes) {
  assertRange(bytes.length, 0, 6, "RT_GROUP_ICON header");
  assert(
    bytes.readUInt16LE(0) === 0 && bytes.readUInt16LE(2) === 1,
    "RT_GROUP_ICON header must identify an icon group",
  );
  const count = bytes.readUInt16LE(4);
  assert(
    count > 0 && count <= MAX_ICON_FRAMES,
    `RT_GROUP_ICON frame count must be between 1 and ${MAX_ICON_FRAMES}`,
  );
  assert(
    bytes.length === 6 + count * 14,
    "RT_GROUP_ICON payload length does not exactly match its frame count",
  );
  const resourceIds = new Set();
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 14;
    const resourceId = bytes.readUInt16LE(offset + 12);
    assert(
      bytes[offset + 3] === 0,
      `RT_GROUP_ICON frame ${index + 1} reserved byte must be zero`,
    );
    assert(
      resourceId > 0 && !resourceIds.has(resourceId),
      "RT_GROUP_ICON frame IDs must be non-zero and unique",
    );
    resourceIds.add(resourceId);
    entries.push(
      Object.freeze({
        index,
        widthByte: bytes[offset],
        heightByte: bytes[offset + 1],
        width: normalizedIconDimension(bytes[offset]),
        height: normalizedIconDimension(bytes[offset + 1]),
        colorCount: bytes[offset + 2],
        planes: bytes.readUInt16LE(offset + 4),
        bitCount: bytes.readUInt16LE(offset + 6),
        size: bytes.readUInt32LE(offset + 8),
        resourceId,
      }),
    );
  }
  return Object.freeze(entries);
}

function assertFrameMetadata(groupFrame, canonicalFrame) {
  const label = `Embedded icon frame ${groupFrame.index + 1}`;
  assert(
    groupFrame.widthByte === canonicalFrame.widthByte &&
      groupFrame.heightByte === canonicalFrame.heightByte &&
      groupFrame.width === canonicalFrame.width &&
      groupFrame.height === canonicalFrame.height,
    `${label} dimensions do not match the canonical ICO frame`,
  );
  assert(
    groupFrame.colorCount === canonicalFrame.colorCount,
    `${label} color count does not match the canonical ICO frame`,
  );
  assert(
    groupFrame.planes === canonicalFrame.planes,
    `${label} planes do not match the canonical ICO frame`,
  );
  assert(
    groupFrame.bitCount === canonicalFrame.bitCount,
    `${label} bit depth does not match the canonical ICO frame`,
  );
  assert(
    groupFrame.size === canonicalFrame.size,
    `${label} size does not match the canonical ICO frame`,
  );
}

export function verifyWindowsSetupIconBytes(setupBytes, canonicalIcoBytes) {
  const canonicalFrames = parseCanonicalIco(canonicalIcoBytes);
  const pe = parsePeResourceImage(setupBytes);
  const leaves = parseResourceLeaves(setupBytes, pe);
  const groupLeaves = leaves
    .map((leaf) => numericIconLeaf(leaf, RT_GROUP_ICON, "RT_GROUP_ICON"))
    .filter((leaf) => leaf !== null);
  assert(
    groupLeaves.length === 1,
    "Windows setup must contain exactly one RT_GROUP_ICON resource; extra, missing, or default icon groups are forbidden",
  );
  const groupLeaf = groupLeaves[0];
  assert(
    groupLeaf.resourceId > 0,
    "Windows setup RT_GROUP_ICON resource ID must be non-zero",
  );
  const groupFrames = parseGroupIcon(groupLeaf.bytes);
  assert(
    groupFrames.length === canonicalFrames.length,
    "Windows setup icon-group frame count does not match the canonical ICO",
  );

  const iconLeaves = leaves
    .map((leaf) => numericIconLeaf(leaf, RT_ICON, "RT_ICON"))
    .filter((leaf) => leaf !== null);
  assert(
    iconLeaves.length === canonicalFrames.length,
    "Windows setup must contain exactly the RT_ICON frames referenced by the canonical icon group",
  );
  const iconsById = new Map();
  for (const iconLeaf of iconLeaves) {
    assert(
      iconLeaf.languageId === groupLeaf.languageId,
      "Windows setup RT_ICON language does not match RT_GROUP_ICON language",
    );
    assert(
      !iconsById.has(iconLeaf.resourceId),
      "Windows setup contains duplicate RT_ICON resource IDs",
    );
    iconsById.set(iconLeaf.resourceId, iconLeaf);
  }

  const resultFrames = [];
  for (let index = 0; index < canonicalFrames.length; index += 1) {
    const canonicalFrame = canonicalFrames[index];
    const groupFrame = groupFrames[index];
    assertFrameMetadata(groupFrame, canonicalFrame);
    const iconLeaf = iconsById.get(groupFrame.resourceId);
    assert(
      iconLeaf,
      `Windows setup is missing RT_ICON resource ID ${groupFrame.resourceId}`,
    );
    assert(
      iconLeaf.bytes.length === canonicalFrame.size,
      `RT_ICON resource ID ${groupFrame.resourceId} size does not match the canonical ICO frame`,
    );
    assert(
      iconLeaf.bytes.equals(canonicalFrame.bytes),
      `RT_ICON resource ID ${groupFrame.resourceId} bytes do not match the canonical ICO frame`,
    );
    iconsById.delete(groupFrame.resourceId);
    resultFrames.push(
      Object.freeze({
        resourceId: groupFrame.resourceId,
        width: groupFrame.width,
        height: groupFrame.height,
        bitCount: groupFrame.bitCount,
        size: groupFrame.size,
      }),
    );
  }
  assert(
    iconsById.size === 0,
    "Windows setup contains unreferenced RT_ICON resources",
  );
  return Object.freeze({
    groupResourceId: groupLeaf.resourceId,
    languageId: groupLeaf.languageId,
    frames: Object.freeze(resultFrames),
  });
}

function readStableRegularFile(filePath, label, maxBytes) {
  assert(
    typeof filePath === "string" &&
      filePath.length > 0 &&
      !filePath.includes("\0"),
    `${label} path is invalid`,
  );
  const resolvedPath = path.resolve(filePath);
  const pathStat = lstatSync(resolvedPath, { bigint: true });
  assert(!pathStat.isSymbolicLink(), `${label} must not be a symbolic link`);
  assert(pathStat.isFile(), `${label} must be a regular file`);
  const descriptor = openSync(resolvedPath, "r");
  try {
    const before = fstatSync(descriptor, { bigint: true });
    assert(before.isFile(), `${label} opened handle is not a regular file`);
    assert(
      before.dev === pathStat.dev && before.ino === pathStat.ino,
      `${label} changed while it was being opened`,
    );
    assert(
      before.size > 0n && before.size <= BigInt(maxBytes),
      `${label} size is invalid`,
    );
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    assert(
      after.dev === before.dev &&
        after.ino === before.ino &&
        after.size === before.size &&
        after.mtimeNs === before.mtimeNs &&
        BigInt(bytes.length) === before.size,
      `${label} changed while it was being read`,
    );
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

export function verifyWindowsSetupIconFiles(setupPath, canonicalIcoPath) {
  return verifyWindowsSetupIconBytes(
    readStableRegularFile(setupPath, "Windows setup", MAX_SETUP_BYTES),
    readStableRegularFile(
      canonicalIcoPath,
      "Canonical ICO",
      MAX_CANONICAL_ICO_BYTES,
    ),
  );
}

export function runWindowsSetupIconCli(argv = process.argv.slice(2)) {
  if (argv.length !== 2) {
    throw new Error(
      "Usage: node scripts/release/verify-windows-setup-icon.mjs <setup.exe> <canonical.ico>",
    );
  }
  const result = verifyWindowsSetupIconFiles(argv[0], argv[1]);
  console.log(
    `Windows setup embeds exactly one canonical FyAgent icon group with ${result.frames.length} frames`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    runWindowsSetupIconCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
