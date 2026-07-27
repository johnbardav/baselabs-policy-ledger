import { createHash } from 'node:crypto';
import { canonicalJson } from './canonical-json';

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function hashRequest(value: unknown): string {
  return sha256(canonicalJson(value));
}

export function hashPolicyEvent(previousHash: string | null, canonicalPayload: unknown): string {
  return sha256(`${previousHash ?? 'GENESIS'}|${canonicalJson(canonicalPayload)}`);
}
