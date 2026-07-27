import { canonicalJson } from '../../src/common/utils/canonical-json';
import { hashRequest } from '../../src/common/utils/hash';

describe('canonical JSON', () => {
  it('sorts object keys recursively', () => {
    expect(canonicalJson({ z: 1, a: { d: 4, b: 2 } })).toBe(
      '{"a":{"b":2,"d":4},"z":1}',
    );
  });

  it('creates the same request hash for different object key order', () => {
    expect(hashRequest({ amount: 100, currency: 'USD' })).toBe(
      hashRequest({ currency: 'USD', amount: 100 }),
    );
  });
});
