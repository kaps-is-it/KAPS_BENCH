import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const outputDir = join(rootDir, "public", "benchmarks", "coding");

function encodeUnsignedLeb128(value) {
  const bytes = [];
  let remaining = value >>> 0;

  do {
    let byte = remaining & 0x7f;
    remaining >>>= 7;

    if (remaining !== 0) {
      byte |= 0x80;
    }

    bytes.push(byte);
  } while (remaining !== 0);

  return bytes;
}

function createSection(sectionId, payload) {
  return [sectionId, ...encodeUnsignedLeb128(payload.length), ...payload];
}

function encodeString(value) {
  const bytes = Array.from(Buffer.from(value, "utf8"));
  return [...encodeUnsignedLeb128(bytes.length), ...bytes];
}

function encodeI32Const(value) {
  return [0x41, ...encodeUnsignedLeb128(value)];
}

function createWasmModule() {
  const FUNCTION_COUNT = 2400;
  const CHAIN_LENGTH = 24;

  const bytes = [
    0x00,
    0x61,
    0x73,
    0x6d,
    0x01,
    0x00,
    0x00,
    0x00,
  ];

  const typeSection = createSection(1, [
    ...encodeUnsignedLeb128(1),
    0x60,
    ...encodeUnsignedLeb128(0),
    ...encodeUnsignedLeb128(1),
    0x7f,
  ]);

  const functionSection = createSection(3, [
    ...encodeUnsignedLeb128(FUNCTION_COUNT),
    ...Array.from({ length: FUNCTION_COUNT }, () => 0),
  ]);

  const exportSection = createSection(7, [
    ...encodeUnsignedLeb128(1),
    ...encodeString("main"),
    0x00,
    ...encodeUnsignedLeb128(0),
  ]);

  const codeEntries = [];

  for (let index = 0; index < FUNCTION_COUNT; index += 1) {
    const instructions = [];
    instructions.push(...encodeI32Const((index % 91) + 1));

    for (let inner = 1; inner < CHAIN_LENGTH; inner += 1) {
      instructions.push(...encodeI32Const(((index * 17 + inner * 13) % 97) + 1));
      instructions.push(0x6a);
    }

    instructions.push(0x0b);

    const functionBody = [
      ...encodeUnsignedLeb128(0),
      ...instructions,
    ];

    codeEntries.push(
      ...encodeUnsignedLeb128(functionBody.length),
      ...functionBody,
    );
  }

  const codeSection = createSection(10, [
    ...encodeUnsignedLeb128(FUNCTION_COUNT),
    ...codeEntries,
  ]);

  return Buffer.from(
    bytes.concat(typeSection, functionSection, exportSection, codeSection),
  );
}

function createJavascriptPayload() {
  const chunks = ['"use strict";\n', "const registry = [];\n"];
  const blockCount = 900;
  const rounds = 12;

  for (let index = 0; index < blockCount; index += 1) {
    chunks.push(`function block${index}(seed){\n`);
    chunks.push(`  let total = (seed ^ ${index}) >>> 0;\n`);

    for (let round = 0; round < rounds; round += 1) {
      chunks.push(
        `  total = Math.imul(total + ${round + index}, 1664525) >>> 0;\n`,
      );
      chunks.push(`  total ^= total >>> ${((round % 5) + 1).toString()};\n`);
      chunks.push(`  total = (total + ${round * 3 + 7}) >>> 0;\n`);
    }

    chunks.push("  return total >>> 0;\n");
    chunks.push("}\n");
    chunks.push(`registry.push(block${index});\n`);
  }

  chunks.push("let checksum = 0;\n");
  chunks.push("for (let index = 0; index < registry.length; index += 1) {\n");
  chunks.push("  checksum ^= registry[index](index + 17);\n");
  chunks.push("}\n");
  chunks.push("return checksum >>> 0;\n");

  return chunks.join("");
}

await mkdir(outputDir, { recursive: true });

const wasmModule = createWasmModule();
const javascriptPayload = createJavascriptPayload();

await writeFile(join(outputDir, "benchmark-module.wasm"), wasmModule);
await writeFile(join(outputDir, "js-payload.js"), javascriptPayload, "utf8");

console.log(
  JSON.stringify({
    wasmBytes: wasmModule.byteLength,
    jsPayloadBytes: Buffer.byteLength(javascriptPayload, "utf8"),
    outputDir,
  }),
);
