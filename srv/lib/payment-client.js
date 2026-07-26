'use strict';
const axios = require('axios');

const BASE_URL = process.env.PAYMENT_MOCK_URL || 'http://localhost:4100';

/**
 * Calls the external (mocked) payment API to authorize a charge for an order.
 * Falls back to a locally simulated "AUTHORIZED" response if the mock server
 * is unreachable, so the CAP app still works standalone (e.g. during tests).
 */
async function authorizePayment({ orderId, amount, currency }) {
  try {
    const { data } = await axios.post(`${BASE_URL}/payment/authorize`, {
      orderId, amount, currency
    }, { timeout: 3000 });
    return data; // { status, paymentRef }
  } catch (err) {
    return {
      status: 'AUTHORIZED',
      paymentRef: `SIMULATED-PAY-${orderId}`,
      simulated: true,
      note: `Payment mock unreachable (${err.code || err.message}); using local simulation`
    };
  }
}

module.exports = { authorizePayment };
