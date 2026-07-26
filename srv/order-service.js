'use strict';
const cds = require('@sap/cds');
const { getTenant } = require('./lib/tenant');
const { canTransition, canCancel, nextStatus } = require('./lib/state-machine');
const { authorizePayment } = require('./lib/payment-client');
const { dispatchShipment } = require('./lib/shipping-client');

// simple in-memory audit trail per order (demo only — swap for a persisted
// OrderHistory entity in a real project)
const historyLog = new Map();

function logHistory(orderId, entry) {
  const list = historyLog.get(orderId) || [];
  list.push(`${new Date().toISOString()} - ${entry}`);
  historyLog.set(orderId, list);
}

function userRoles(req) {
  return (req.user && req.user.roles && Object.keys(req.user.roles).filter(r => req.user.roles[r])) ||
         (req.user && req.user._roles) || [];
}

module.exports = cds.service.impl(async function () {
  const { Orders, Customers, Warehouses } = this.entities;

  // ---------- Multi-tenancy: scope every read to the caller's tenant ----------
  this.before('READ', [Orders, Customers, Warehouses], (req) => {
    const tenant = getTenant(req);
    req.query.where('tenant =', tenant);
  });

  // ---------- Multi-tenancy: stamp tenant on create ----------
  this.before('CREATE', Orders, (req) => {
    req.data.tenant = getTenant(req);
    req.data.status = req.data.status || 'Created';
  });

  this.before('CREATE', Customers, (req) => { req.data.tenant = getTenant(req); });
  this.before('CREATE', Warehouses, (req) => { req.data.tenant = getTenant(req); });

  // ---------- CREATE: authorize payment for the new order ----------
  this.after('CREATE', Orders, async (order, req) => {
    if (!order) return;
    const payment = await authorizePayment({
      orderId: order.ID,
      amount: order.totalAmount || 0,
      currency: order.currency || 'USD'
    });
    await UPDATE(Orders, order.ID).with({ paymentRef: payment.paymentRef });
    logHistory(order.ID, `Created (payment ${payment.status}, ref ${payment.paymentRef})`);
  });

  // ---------- helper to load current order scoped to tenant ----------
  async function loadOrder(req) {
    const tenant = getTenant(req);
    const orderId = req.params[0].ID || req.params[0];
    const order = await SELECT.one.from(Orders).where({ ID: orderId, tenant });
    if (!order) req.reject(404, `Order ${orderId} not found for this tenant`);
    return order;
  }

  // ---------- confirmOrder: Created -> Confirmed ----------
  this.on('confirmOrder', Orders, async (req) => {
    const order = await loadOrder(req);
    if (!order) return;
    const check = canTransition(order.status, 'Confirmed', userRoles(req));
    if (!check.ok) return req.reject(403, check.reason);

    await UPDATE(Orders, order.ID).with({ status: 'Confirmed' });
    logHistory(order.ID, `Confirmed by ${req.user.id}`);
    return SELECT.one.from(Orders, order.ID);
  });

  // ---------- packOrder: Confirmed -> Packed ----------
  this.on('packOrder', Orders, async (req) => {
    const order = await loadOrder(req);
    if (!order) return;
    const check = canTransition(order.status, 'Packed', userRoles(req));
    if (!check.ok) return req.reject(403, check.reason);

    await UPDATE(Orders, order.ID).with({ status: 'Packed' });
    logHistory(order.ID, `Packed by ${req.user.id}`);
    return SELECT.one.from(Orders, order.ID);
  });

  // ---------- shipOrder: Packed -> Shipped (calls shipping mock) ----------
  this.on('shipOrder', Orders, async (req) => {
    const order = await loadOrder(req);
    if (!order) return;
    const check = canTransition(order.status, 'Shipped', userRoles(req));
    if (!check.ok) return req.reject(403, check.reason);

    const shipment = await dispatchShipment({ orderId: order.ID, warehouseId: order.warehouse_ID });
    await UPDATE(Orders, order.ID).with({ status: 'Shipped', shippingRef: shipment.shippingRef });
    logHistory(order.ID, `Shipped by ${req.user.id} (ref ${shipment.shippingRef})`);
    return SELECT.one.from(Orders, order.ID);
  });

  // ---------- deliverOrder: Shipped -> Delivered ----------
  this.on('deliverOrder', Orders, async (req) => {
    const order = await loadOrder(req);
    if (!order) return;
    const check = canTransition(order.status, 'Delivered', userRoles(req));
    if (!check.ok) return req.reject(403, check.reason);

    await UPDATE(Orders, order.ID).with({ status: 'Delivered' });
    logHistory(order.ID, `Delivered, confirmed by ${req.user.id}`);
    return SELECT.one.from(Orders, order.ID);
  });

  // ---------- cancelOrder: Created/Confirmed -> Cancelled (Admin: any state) ----------
  this.on('cancelOrder', Orders, async (req) => {
    const order = await loadOrder(req);
    if (!order) return;
    const check = canCancel(order.status, userRoles(req));
    if (!check.ok) return req.reject(403, check.reason);

    await UPDATE(Orders, order.ID).with({
      status: 'Cancelled',
      cancelReason: req.data.reason || 'No reason provided'
    });
    logHistory(order.ID, `Cancelled by ${req.user.id}: ${req.data.reason || 'no reason'}`);
    return SELECT.one.from(Orders, order.ID);
  });

  // ---------- reassignWarehouse: SalesRep/Admin only, before Shipped ----------
  this.on('reassignWarehouse', Orders, async (req) => {
    const order = await loadOrder(req);
    if (!order) return;
    if (['Shipped', 'Delivered', 'Cancelled'].includes(order.status)) {
      return req.reject(409, `Cannot reassign warehouse once order is '${order.status}'`);
    }
    const tenant = getTenant(req);
    const warehouse = await SELECT.one.from(Warehouses).where({ ID: req.data.warehouse_ID, tenant });
    if (!warehouse) return req.reject(404, 'Warehouse not found for this tenant');

    await UPDATE(Orders, order.ID).with({ warehouse_ID: req.data.warehouse_ID });
    logHistory(order.ID, `Reassigned to warehouse ${warehouse.name} by ${req.user.id}`);
    return SELECT.one.from(Orders, order.ID);
  });

  // ---------- getOrderHistory function ----------
  this.on('getOrderHistory', async (req) => {
    return historyLog.get(req.data.orderID) || [];
  });
});
