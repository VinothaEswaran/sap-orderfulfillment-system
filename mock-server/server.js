'use strict';
/**
 * Standalone mock of an external Payment + Shipping provider.
 * Run separately from the CAP app: `npm run mock:external`
 * Listens on PORT (default 4100). The CAP app calls this via
 * srv/lib/payment-client.js and srv/lib/shipping-client.js.
 */
const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.MOCK_PORT || 4100;

app.post('/payment/authorize', (req, res) => {
  const { orderId, amount, currency } = req.body || {};
  console.log(`[payment-mock] authorize order=${orderId} amount=${amount} ${currency}`);
  // simulate occasional latency, always succeed for demo purposes
  setTimeout(() => {
    res.json({
      status: 'AUTHORIZED',
      paymentRef: `PAY-${orderId}-${Date.now()}`,
      amount,
      currency
    });
  }, 150);
});

app.post('/shipping/dispatch', (req, res) => {
  const { orderId, warehouseId } = req.body || {};
  console.log(`[shipping-mock] dispatch order=${orderId} warehouse=${warehouseId}`);
  setTimeout(() => {
    res.json({
      status: 'DISPATCHED',
      shippingRef: `SHIP-${orderId}-${Date.now()}`,
      eta: '3-5 business days'
    });
  }, 150);
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`External payment/shipping mock listening on http://localhost:${PORT}`);
});
