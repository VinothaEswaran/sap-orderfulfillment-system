'use strict';
const axios = require('axios');

const BASE_URL = process.env.SHIPPING_MOCK_URL || 'http://localhost:4100';

/**
 * Calls the external (mocked) shipping API to dispatch a package for an order.
 * Falls back to a locally simulated response if the mock server is unreachable.
 */
async function dispatchShipment({ orderId, warehouseId }) {
  try {
    const { data } = await axios.post(`${BASE_URL}/shipping/dispatch`, {
      orderId, warehouseId
    }, { timeout: 3000 });
    return data; // { status, shippingRef, eta }
  } catch (err) {
    return {
      status: 'DISPATCHED',
      shippingRef: `SIMULATED-SHIP-${orderId}`,
      eta: '3-5 business days',
      simulated: true,
      note: `Shipping mock unreachable (${err.code || err.message}); using local simulation`
    };
  }
}

module.exports = { dispatchShipment };
