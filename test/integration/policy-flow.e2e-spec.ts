import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { execFileSync } from 'node:child_process';
import { Client } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { ApiExceptionFilter } from '../../src/common/exceptions/api-exception.filter';

const databaseUrl =
  process.env.DATABASE_URL_TEST ??
  'postgresql://postgres:postgres@localhost:5433/pas_test';
process.env.DATABASE_URL = databaseUrl;
process.env.NODE_ENV = 'test';

describe('policy workflow (integration)', () => {
  let app: INestApplication;
  let client: Client;

  beforeAll(async () => {
    execFileSync('node', ['scripts/migrate.mjs'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(`
      TRUNCATE TABLE
        ledger_entries,
        ledger_transactions,
        payments,
        billing_documents,
        policy_events,
        idempotency_records,
        policies
      RESTART IDENTITY CASCADE
    `);
    await client.query(`
      INSERT INTO policies (
        id, homeowner_id, status, term_start, term_end, annual_premium_cents, currency
      ) VALUES (
        'POL-1001', 'HOME-204', 'active', '2026-01-01', '2027-01-01', 120000, 'USD'
      )
    `);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await client?.end();
  });

  it('handles proration, duplicates, currency failure, balanced ledger, and history', async () => {
    const endorsementPayload = {
      effective_date: '2026-07-01',
      new_annual_premium_cents: 144000,
      reason: 'Water-shutoff discount removed',
    };

    await request(app.getHttpServer())
      .post('/api/policies/POL-1001/endorsements')
      .set('Idempotency-Key', 'END-BAD-SHAPE')
      .send({ ...endorsementPayload, unexpected_field: true })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/policies/POL-1001/endorsements')
      .send(endorsementPayload)
      .expect(400);

    const firstEndorsement = await request(app.getHttpServer())
      .post('/api/policies/POL-1001/endorsements')
      .set('Idempotency-Key', 'END-2001')
      .send(endorsementPayload)
      .expect(201);
    expect(firstEndorsement.body.endorsement.prorated_delta_cents).toBe(12099);
    expect(firstEndorsement.body.ledger_transaction.balanced).toBe(true);

    const duplicateEndorsement = await request(app.getHttpServer())
      .post('/api/policies/POL-1001/endorsements')
      .set('Idempotency-Key', 'END-2001')
      .send(endorsementPayload)
      .expect(201);
    expect(duplicateEndorsement.headers['idempotency-replayed']).toBe('true');
    expect(duplicateEndorsement.body).toEqual(firstEndorsement.body);

    await request(app.getHttpServer())
      .post('/api/policies/POL-1001/endorsements')
      .set('Idempotency-Key', 'END-2001')
      .send({ ...endorsementPayload, new_annual_premium_cents: 145000 })
      .expect(409);

    const countsBeforeWrongCurrency = await client.query(`
      SELECT
        (SELECT COUNT(*)::INTEGER FROM payments) AS payments,
        (SELECT COUNT(*)::INTEGER FROM policy_events) AS policy_events,
        (SELECT COUNT(*)::INTEGER FROM ledger_transactions) AS ledger_transactions,
        (SELECT COUNT(*)::INTEGER FROM idempotency_records) AS idempotency_records
    `);

    await request(app.getHttpServer())
      .post('/api/policies/POL-1001/payments')
      .set('Idempotency-Key', 'PAY-9002')
      .send({
        external_payment_id: 'PAY-9002',
        amount_cents: 5000,
        currency: 'EUR',
        received_at: '2026-07-04T10:00:00Z',
      })
      .expect(422);

    const countsAfterWrongCurrency = await client.query(`
      SELECT
        (SELECT COUNT(*)::INTEGER FROM payments) AS payments,
        (SELECT COUNT(*)::INTEGER FROM policy_events) AS policy_events,
        (SELECT COUNT(*)::INTEGER FROM ledger_transactions) AS ledger_transactions,
        (SELECT COUNT(*)::INTEGER FROM idempotency_records) AS idempotency_records
    `);
    expect(countsAfterWrongCurrency.rows[0]).toEqual(countsBeforeWrongCurrency.rows[0]);

    const paymentPayload = {
      external_payment_id: 'PAY-9001',
      amount_cents: 12099,
      currency: 'USD',
      received_at: '2026-07-03T18:30:00Z',
    };
    const firstPayment = await request(app.getHttpServer())
      .post('/api/policies/POL-1001/payments')
      .set('Idempotency-Key', 'PAY-9001')
      .send(paymentPayload)
      .expect(201);
    expect(firstPayment.body.open_balance_cents).toBe(0);

    const duplicatePayment = await request(app.getHttpServer())
      .post('/api/policies/POL-1001/payments')
      .set('Idempotency-Key', 'PAY-9001')
      .send(paymentPayload)
      .expect(201);
    expect(duplicatePayment.headers['idempotency-replayed']).toBe('true');
    expect(duplicatePayment.body).toEqual(firstPayment.body);

    const duplicateByExternalId = await request(app.getHttpServer())
      .post('/api/policies/POL-1001/payments')
      .set('Idempotency-Key', 'PAY-9001-DELIVERY-2')
      .send(paymentPayload)
      .expect(201);
    expect(duplicateByExternalId.headers['idempotency-replayed']).toBe('true');
    expect(duplicateByExternalId.body).toEqual(firstPayment.body);

    await request(app.getHttpServer())
      .post('/api/policies/POL-1001/payments')
      .set('Idempotency-Key', 'PAY-9001-CONFLICT')
      .send({ ...paymentPayload, amount_cents: 12100 })
      .expect(409);

    const state = await request(app.getHttpServer())
      .get('/api/policies/POL-1001')
      .expect(200);
    expect(state.body.annual_premium_cents).toBe(144000);
    expect(state.body.open_balance_cents).toBe(0);
    expect(state.body.payments).toHaveLength(1);
    expect(state.body.endorsements).toHaveLength(1);
    expect(state.body.ledger.balanced).toBe(true);
    expect(state.body.history).toMatchObject({ valid: true, event_count: 2 });

    const ledger = await request(app.getHttpServer())
      .get('/api/policies/POL-1001/ledger')
      .expect(200);
    expect(ledger.body.balanced).toBe(true);
    expect(ledger.body.transactions).toHaveLength(2);

    const history = await request(app.getHttpServer())
      .get('/api/policies/POL-1001/history/verify')
      .expect(200);
    expect(history.body).toMatchObject({ valid: true, event_count: 2 });


    await client.query('BEGIN');
    await client.query(`
      INSERT INTO ledger_transactions (
        id, policy_id, source_type, source_id, description
      ) VALUES (
        'LTX-UNBALANCED-TEST', 'POL-1001', 'payment', 'UNBALANCED-TEST', 'Expected to fail'
      )
    `);
    await client.query(`
      INSERT INTO ledger_entries (
        id, ledger_transaction_id, account_code, debit_cents, credit_cents, currency
      ) VALUES (
        'LEN-UNBALANCED-TEST', 'LTX-UNBALANCED-TEST', 'CASH', 100, 0, 'USD'
      )
    `);
    await expect(client.query('COMMIT')).rejects.toThrow();
    await client.query('ROLLBACK').catch(() => undefined);
    const rejectedLedger = await client.query(
      `SELECT COUNT(*)::INTEGER AS count FROM ledger_transactions WHERE id = 'LTX-UNBALANCED-TEST'`,
    );
    expect(rejectedLedger.rows[0].count).toBe(0);

    await expect(
      client.query(`
        UPDATE policy_events
        SET event_type = 'tampered'
        WHERE policy_id = 'POL-1001' AND sequence_no = 1
      `),
    ).rejects.toThrow();
  });
});
