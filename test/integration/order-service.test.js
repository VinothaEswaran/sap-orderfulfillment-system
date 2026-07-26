'use strict';
const path = require('path');
const cds = require('@sap/cds');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

describe('OrderService integration (cds.test)', () => {
  const { axios } = cds.test(PROJECT_ROOT);

  function asUser(name) {
    return { auth: { username: name, password: 'pass' } };
  }

  // Draft-enabled entities are created as a draft (IsActiveEntity=false) and
  // must be activated before they become a real, queryable/actionable record.
  async function createAndActivateOrder(creatorUser, body) {
    const draft = await axios.post('/odata/v4/order/Orders', body, asUser(creatorUser));
    const { ID } = draft.data;
    await axios.post(
      `/odata/v4/order/Orders(ID=${ID},IsActiveEntity=false)/OrderService.draftActivate`,
      {},
      asUser(creatorUser)
    );
    return ID;
  }

  function activeKey(id) {
    return `Orders(ID=${id},IsActiveEntity=true)`;
  }

  let orderId;

  test('Customer (alice, tenant t1) can create and activate an order', async () => {
    orderId = await createAndActivateOrder('alice', { totalAmount: 100, currency: 'USD' });
    expect(orderId).toBeTruthy();

    const res = await axios.get(`/odata/v4/order/${activeKey(orderId)}`, asUser('alice'));
    expect(res.data.status).toBe('Created');
    expect(res.data.tenant).toBe('t1');
    expect(res.data.paymentRef).toBeTruthy(); // set by payment-mock integration in after(CREATE)
  });

  test('Customer cannot confirm their own order (wrong role)', async () => {
    await expect(
      axios.post(`/odata/v4/order/${activeKey(orderId)}/OrderService.confirmOrder`, {}, asUser('alice'))
    ).rejects.toMatchObject({ response: { status: 403 } });
  });

  test('SalesRep (bob, tenant t1) can confirm the order', async () => {
    const res = await axios.post(
      `/odata/v4/order/${activeKey(orderId)}/OrderService.confirmOrder`, {}, asUser('bob')
    );
    expect(res.data.status).toBe('Confirmed');
  });

  test('Warehouse (carol, tenant t1) can pack then ship the order', async () => {
    const packed = await axios.post(
      `/odata/v4/order/${activeKey(orderId)}/OrderService.packOrder`, {}, asUser('carol')
    );
    expect(packed.data.status).toBe('Packed');

    const shipped = await axios.post(
      `/odata/v4/order/${activeKey(orderId)}/OrderService.shipOrder`, {}, asUser('carol')
    );
    expect(shipped.data.status).toBe('Shipped');
    expect(shipped.data.shippingRef).toBeTruthy();
  });

  test('cannot go backwards / re-pack an already Shipped order', async () => {
    await expect(
      axios.post(`/odata/v4/order/${activeKey(orderId)}/OrderService.packOrder`, {}, asUser('carol'))
    ).rejects.toMatchObject({ response: { status: 403 } });
  });

  test('Customer (erin, tenant t2) cannot see tenant t1 orders', async () => {
    const res = await axios.get('/odata/v4/order/Orders', asUser('erin'));
    const found = res.data.value.find(o => o.ID === orderId);
    expect(found).toBeUndefined();
  });

  test('Admin (dave) can cancel a Packed order via override; Customer alone cannot', async () => {
    const id2 = await createAndActivateOrder('alice', { totalAmount: 50, currency: 'USD' });

    await axios.post(`/odata/v4/order/${activeKey(id2)}/OrderService.confirmOrder`, {}, asUser('bob'));
    const packed = await axios.post(`/odata/v4/order/${activeKey(id2)}/OrderService.packOrder`, {}, asUser('carol'));
    expect(packed.data.status).toBe('Packed');

    // Customer can no longer self-cancel once Packed
    await expect(
      axios.post(`/odata/v4/order/${activeKey(id2)}/OrderService.cancelOrder`, { reason: 'changed my mind' }, asUser('alice'))
    ).rejects.toMatchObject({ response: { status: 403 } });

    // Admin override still works
    const cancelled = await axios.post(
      `/odata/v4/order/${activeKey(id2)}/OrderService.cancelOrder`,
      { reason: 'Admin override - customer request' },
      asUser('dave')
    );
    expect(cancelled.data.status).toBe('Cancelled');
  });

  test('SalesRep can reassign warehouse before shipping', async () => {
    const id3 = await createAndActivateOrder('alice', { totalAmount: 75, currency: 'USD' });
    const whs = await axios.get('/odata/v4/order/Warehouses', asUser('bob'));
    const warehouseId = whs.data.value[0].ID;

    const res = await axios.post(
      `/odata/v4/order/${activeKey(id3)}/OrderService.reassignWarehouse`,
      { warehouse_ID: warehouseId },
      asUser('bob')
    );
    expect(res.data.warehouse_ID).toBe(warehouseId);
  });
});
