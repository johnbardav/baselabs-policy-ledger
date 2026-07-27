"use strict";
const byId = (id) => {
    const element = document.getElementById(id);
    if (!element)
        throw new Error(`Missing element #${id}`);
    return element;
};
const policyIdInput = byId('policy-id');
const loadButton = byId('load-policy');
const globalStatus = byId('global-status');
const policySummary = byId('policy-summary');
const details = byId('details');
const rawPanel = byId('raw-response-panel');
const rawResponse = byId('raw-response');
const endorsementForm = byId('endorsement-form');
const paymentForm = byId('payment-form');
function money(cents, currency) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}
function setStatus(message, state) {
    globalStatus.textContent = message;
    globalStatus.className = `status ${state}`;
}
function showRaw(body) {
    rawPanel.classList.remove('hidden');
    rawResponse.textContent = JSON.stringify(body, null, 2);
}
async function api(path, options) {
    const response = await fetch(`/api${path}`, options);
    const text = await response.text();
    let body = null;
    try {
        body = text ? JSON.parse(text) : null;
    }
    catch {
        body = text;
    }
    if (!response.ok) {
        const payload = body;
        const message = Array.isArray(payload?.message)
            ? payload.message.join('; ')
            : payload?.message ?? payload?.error ?? `Request failed with status ${response.status}`;
        const error = new Error(message);
        error.body = body;
        throw error;
    }
    return {
        body,
        replayed: response.headers.get('idempotency-replayed') === 'true',
    };
}
function renderPolicy(state) {
    byId('summary-title').textContent = `${state.policy_id} · ${state.status}`;
    const historyBadge = byId('history-badge');
    historyBadge.textContent = state.history.valid
        ? `History valid · ${state.history.event_count} events`
        : 'History invalid';
    historyBadge.className = `badge ${state.history.valid ? 'valid' : 'invalid'}`;
    const fields = [
        ['Annual premium', money(state.annual_premium_cents, state.currency)],
        ['Open balance', money(state.open_balance_cents, state.currency)],
        ['Currency', state.currency],
        ['Term', `${state.term_start} → ${state.term_end}`],
        ['Ledger', state.ledger.balanced ? 'Balanced' : 'Unbalanced'],
        ['Debits', money(state.ledger.total_debits_cents, state.currency)],
        ['Credits', money(state.ledger.total_credits_cents, state.currency)],
        ['Transactions', String(state.ledger.transactions.length)],
    ];
    byId('summary-grid').innerHTML = fields
        .map(([label, value]) => `<div class="summary-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
        .join('');
    byId('plain-summary').textContent = state.summary;
    byId('suggested-action').textContent = `Suggested action: ${state.suggested_action}`;
    byId('timeline').innerHTML = state.timeline.length
        ? state.timeline
            .map((item) => {
            const category = String(item.category ?? 'event');
            const type = String(item.type ?? category);
            const id = String(item.id ?? '');
            const occurredAt = String(item.occurred_at ?? '');
            const amount = typeof item.amount_cents === 'number'
                ? ` · ${money(item.amount_cents, state.currency)}`
                : '';
            return `<div class="timeline-item"><strong>${escapeHtml(type)}${escapeHtml(amount)}</strong><small>${escapeHtml(category)} · ${escapeHtml(id)} · ${escapeHtml(occurredAt)}</small></div>`;
        })
            .join('')
        : '<p>No timeline items yet.</p>';
    byId('ledger-summary').innerHTML = `
    <p><strong>${state.ledger.balanced ? 'Balanced' : 'Unbalanced'}</strong> · Debits ${escapeHtml(money(state.ledger.total_debits_cents, state.currency))} · Credits ${escapeHtml(money(state.ledger.total_credits_cents, state.currency))}</p>
    ${state.ledger.transactions
        .map((transaction) => `
          <div class="ledger-transaction">
            <header><strong>${escapeHtml(transaction.source_type)} · ${escapeHtml(transaction.source)}</strong><span>${transaction.balanced ? 'Balanced' : 'Unbalanced'}</span></header>
            <ul>${transaction.entries
        .map((entry) => `<li>${escapeHtml(entry.account)} — DR ${entry.debit_cents} / CR ${entry.credit_cents} ${escapeHtml(entry.currency)}</li>`)
        .join('')}</ul>
          </div>`)
        .join('')}
  `;
    policySummary.classList.remove('hidden');
    details.classList.remove('hidden');
}
function escapeHtml(value) {
    return value.replace(/[&<>'"]/g, (character) => {
        const entities = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#039;',
            '"': '&quot;',
        };
        return entities[character];
    });
}
async function loadPolicy() {
    const policyId = policyIdInput.value.trim();
    if (!policyId) {
        setStatus('Enter a policy ID.', 'error');
        return;
    }
    setStatus('Loading policy…', 'loading');
    loadButton.disabled = true;
    try {
        const result = await api(`/policies/${encodeURIComponent(policyId)}`);
        const state = result.body;
        renderPolicy(state);
        showRaw(state);
        setStatus('Policy loaded.', 'success');
    }
    catch (error) {
        const requestError = error;
        showRaw(requestError.body ?? { message: requestError.message });
        setStatus(requestError.message, 'error');
    }
    finally {
        loadButton.disabled = false;
    }
}
async function submitForm(form, resultElementId, endpoint, numericFields) {
    const resultElement = byId(resultElementId);
    const submitButton = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const body = {};
    for (const [key, value] of formData.entries()) {
        body[key] = numericFields.includes(key) ? Number(value) : String(value).trim();
    }
    const idempotencyKey = String(body.idempotency_key ?? '');
    resultElement.textContent = 'Submitting…';
    resultElement.className = 'form-result';
    submitButton.disabled = true;
    try {
        const result = await api(endpoint, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'idempotency-key': idempotencyKey,
            },
            body: JSON.stringify(body),
        });
        showRaw(result.body);
        resultElement.textContent = result.replayed
            ? 'Duplicate delivery detected. The original result was returned and no financial entries were duplicated.'
            : 'Request completed successfully.';
        resultElement.className = 'form-result success';
        await loadPolicy();
    }
    catch (error) {
        const requestError = error;
        showRaw(requestError.body ?? { message: requestError.message });
        resultElement.textContent = requestError.message;
        resultElement.className = 'form-result error';
    }
    finally {
        submitButton.disabled = false;
    }
}
loadButton.addEventListener('click', () => void loadPolicy());
endorsementForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const policyId = policyIdInput.value.trim();
    void submitForm(endorsementForm, 'endorsement-result', `/policies/${encodeURIComponent(policyId)}/endorsements`, ['new_annual_premium_cents']);
});
paymentForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const policyId = policyIdInput.value.trim();
    void submitForm(paymentForm, 'payment-result', `/policies/${encodeURIComponent(policyId)}/payments`, ['amount_cents']);
});
void loadPolicy();
