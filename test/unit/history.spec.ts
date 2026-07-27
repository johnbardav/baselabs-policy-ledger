import { hashPolicyEvent } from '../../src/common/utils/hash';
import { verifyPolicyHistory } from '../../src/policies/history';
import { PolicyEventRow } from '../../src/policies/types';

function event(
  sequence: number,
  previousHash: string | null,
  payload: Record<string, unknown>,
): PolicyEventRow {
  return {
    id: `EVT-${sequence}`,
    policy_id: 'POL-1001',
    sequence_no: sequence,
    event_type: String(payload.event_type),
    canonical_payload: payload,
    previous_hash: previousHash,
    event_hash: hashPolicyEvent(previousHash, payload),
    idempotency_key: `KEY-${sequence}`,
    created_at: '2026-07-01T00:00:00.000Z',
  };
}

describe('policy history verification', () => {
  it('accepts a valid chain', () => {
    const first = event(1, null, { event_type: 'endorsement.applied', data: { amount: 10 } });
    const second = event(2, first.event_hash, {
      event_type: 'payment.received',
      data: { amount: 10 },
    });

    expect(verifyPolicyHistory([first, second])).toEqual({
      valid: true,
      event_count: 2,
      head_hash: second.event_hash,
    });
  });

  it('detects payload tampering', () => {
    const first = event(1, null, { event_type: 'endorsement.applied', data: { amount: 10 } });
    first.canonical_payload = {
      event_type: 'endorsement.applied',
      data: { amount: 999 },
    };

    const result = verifyPolicyHistory([first]);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('event_hash');
  });
});
