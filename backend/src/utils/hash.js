import { createHash } from "node:crypto";

export const GENESIS_HASH = "GENESIS_HASH";

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function generateEventHash({
  previousHash,
  batchId,
  eventType,
  dataJson,
  timestamp,
}) {
  return sha256(`${previousHash}${batchId}${eventType}${dataJson}${timestamp}`);
}
