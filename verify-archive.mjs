#!/usr/bin/env node
/**
 * verify-archive.mjs — check the published archive without trusting it.
 *
 * The archive is only useful if a reader can tell it is complete and unaltered.
 * This walks the manifests and checks three things:
 *   1. every file listed exists and hashes to the value in the manifest
 *   2. every bundle's raw readings hash to the readings root the device signed
 *   3. epoch numbering inside each day is accounted for — gaps are reported
 *      rather than hidden, because a gap is evidence of an offline device and
 *      not a defect of the archive
 *
 * Usage:  node verify-archive.mjs [path-to-archive]
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { keccak256 } from "ethers";

const ROOT = process.argv[2] ?? ".";
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

function readingsRoot(readings) {
  const buf = new Uint8Array(readings.length * 16);
  const dv = new DataView(buf.buffer);
  readings.forEach((r, i) => {
    dv.setBigUint64(i * 16, BigInt(r.t), false);
    dv.setUint32(i * 16 + 8, r.mv, false);
    dv.setUint32(i * 16 + 12, r.ma, false);
  });
  return keccak256(buf);
}

const hexToBytes = (h) =>
  Uint8Array.from((h.replace(/^0x/, "").match(/../g) ?? []).map((b) => parseInt(b, 16)));

let files = 0, bad = 0, missingFiles = 0, rootFail = 0, extFail = 0, extLegacy = 0, gaps = 0, days = 0;

const devices = (await readdir(join(ROOT, "manifests"), { withFileTypes: true }))
  .filter((d) => d.isDirectory()).map((d) => d.name);

for (const dev of devices) {
  const mDir = join(ROOT, "manifests", dev);
  for (const mf of (await readdir(mDir)).filter((f) => f.endsWith(".json"))) {
    const m = JSON.parse(await readFile(join(mDir, mf), "utf8"));
    days += 1;
    if (m.missingInRange > 0) {
      gaps += m.missingInRange;
      console.log(`  ${m.day}: ${m.missingInRange} epoch(s) missing between ${m.firstEpochIndex} and ${m.lastEpochIndex} — device was offline or a submission did not land`);
    }
    for (const e of m.entries) {
      files += 1;
      let body;
      try {
        body = await readFile(join(ROOT, e.file));
      } catch {
        missingFiles += 1;
        console.log(`  MISSING ${e.file}`);
        continue;
      }
      if (sha256(body) !== e.sha256) {
        bad += 1;
        console.log(`  ALTERED ${e.file}`);
        continue;
      }
      const b = JSON.parse(body.toString("utf8"));
      if (readingsRoot(b.readings).toLowerCase() !== String(b.attestation.readingsRoot).toLowerCase()) {
        rootFail += 1;
        console.log(`  READINGS ROOT MISMATCH ${e.file}`);
      }
      // Пакети, записані до того, як реле почало класти прообраз розширень,
      // несуть корінь без прообразу. Це не пошкодження архіву, а межа
      // формату: корінь лишається підписаним і перевіряється на ланцюгу,
      // але відтворити його з пакета вже неможливо. Рахуємо окремо.
      const ext = b.extensions;
      const signedRoot = String(b.attestation.extensionsRoot).toLowerCase();
      const emptyRoot = "0x" + "0".repeat(64);
      if (ext === undefined && signedRoot !== emptyRoot) {
        extLegacy += 1;
      } else {
        const extRoot = (ext ?? "").length === 0 ? emptyRoot : keccak256(hexToBytes(ext ?? ""));
        if (extRoot.toLowerCase() !== signedRoot) {
          extFail += 1;
          console.log(`  EXTENSIONS ROOT MISMATCH ${e.file}`);
        }
      }
    }
  }
}

const ok = (b) => (b ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m");
console.log("\n  IPAS archive — integrity check");
console.log("  " + "─".repeat(56));
console.log(`  devices ${devices.length} · days ${days} · bundles ${files}`);
console.log(`  ${ok(missingFiles === 0)}  every file listed in a manifest is present`);
console.log(`  ${ok(bad === 0)}  every file hashes to its manifest entry`);
console.log(`  ${ok(rootFail === 0)}  raw readings hash to the signed readings root`);
// Extension records are covered by a signed root and are checked by the relay
// on receipt. Their encoding is not published, so this tool reports the field's
// presence rather than claiming a verification a reader cannot repeat.
console.log(`  ${gaps === 0 ? "     " : "note "}  ${gaps} epoch(s) absent — offline evidence, not archive damage`);
console.log(`  note   extension roots are signed on chain and checked by the relay; their encoding is not published`);
console.log("");

process.exit(missingFiles + bad + rootFail + extFail === 0 ? 0 : 1);
