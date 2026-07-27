import { hashPolicyEvent } from '../common/utils/hash';
import { PolicyEventRow } from './types';

export interface HistoryVerification {
  valid: boolean;
  event_count: number;
  head_hash: string | null;
  first_invalid_sequence?: number;
  reason?: string;
}

export function verifyPolicyHistory(events: PolicyEventRow[]): HistoryVerification {
  let expectedPreviousHash: string | null = null;
  let expectedSequence = 1;

  for (const event of events) {
    if (event.sequence_no !== expectedSequence) {
      return {
        valid: false,
        event_count: events.length,
        head_hash: expectedPreviousHash,
        first_invalid_sequence: event.sequence_no,
        reason: `Expected sequence ${expectedSequence}, received ${event.sequence_no}.`,
      };
    }

    if (event.previous_hash !== expectedPreviousHash) {
      return {
        valid: false,
        event_count: events.length,
        head_hash: expectedPreviousHash,
        first_invalid_sequence: event.sequence_no,
        reason: 'previous_hash does not match the preceding event hash.',
      };
    }

    const recomputedHash = hashPolicyEvent(event.previous_hash, event.canonical_payload);
    if (recomputedHash !== event.event_hash) {
      return {
        valid: false,
        event_count: events.length,
        head_hash: expectedPreviousHash,
        first_invalid_sequence: event.sequence_no,
        reason: 'event_hash does not match the canonical payload.',
      };
    }

    expectedPreviousHash = event.event_hash;
    expectedSequence += 1;
  }

  return {
    valid: true,
    event_count: events.length,
    head_hash: expectedPreviousHash,
  };
}
