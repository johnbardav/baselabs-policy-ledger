const baseUrl = process.env.API_BASE_URL ?? 'http://localhost:3000/api';
const policyId = 'POL-1001';

async function request(label, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  console.log(`\n=== ${label} (${response.status}) ===`);
  if (response.headers.get('idempotency-replayed')) {
    console.log('Idempotency-Replayed: true');
  }
  console.log(JSON.stringify(body, null, 2));
  return { response, body };
}

const jsonHeaders = (key) => ({
  'content-type': 'application/json',
  'idempotency-key': key,
});

await request('Health', '/health');

const endorsement = {
  idempotency_key: 'END-2001',
  effective_date: '2026-07-01',
  new_annual_premium_cents: 144000,
  reason: 'Water-shutoff discount removed',
};

await request('Apply endorsement', `/policies/${policyId}/endorsements`, {
  method: 'POST',
  headers: jsonHeaders('END-2001'),
  body: JSON.stringify(endorsement),
});

await request('Replay endorsement', `/policies/${policyId}/endorsements`, {
  method: 'POST',
  headers: jsonHeaders('END-2001'),
  body: JSON.stringify(endorsement),
});

const payment = {
  idempotency_key: 'PAY-9001',
  external_payment_id: 'PAY-9001',
  amount_cents: 12099,
  currency: 'USD',
  received_at: '2026-07-03T18:30:00Z',
};

await request('Record received payment', `/policies/${policyId}/payments`, {
  method: 'POST',
  headers: jsonHeaders('PAY-9001'),
  body: JSON.stringify(payment),
});

await request('Replay received payment', `/policies/${policyId}/payments`, {
  method: 'POST',
  headers: jsonHeaders('PAY-9001'),
  body: JSON.stringify(payment),
});

await request('Reject wrong-currency payment', `/policies/${policyId}/payments`, {
  method: 'POST',
  headers: jsonHeaders('PAY-9002'),
  body: JSON.stringify({
    idempotency_key: 'PAY-9002',
    external_payment_id: 'PAY-9002',
    amount_cents: 5000,
    currency: 'EUR',
    received_at: '2026-07-04T10:00:00Z',
  }),
});

await request('Policy state', `/policies/${policyId}`);
await request('Ledger', `/policies/${policyId}/ledger`);
await request('History verification', `/policies/${policyId}/history/verify`);
