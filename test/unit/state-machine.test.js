'use strict';
const { canTransition, canCancel, nextStatus } = require('../../srv/lib/state-machine');

describe('state-machine: canTransition', () => {
  test('SalesRep can confirm a Created order', () => {
    expect(canTransition('Created', 'Confirmed', ['SalesRep']).ok).toBe(true);
  });

  test('Customer cannot confirm a Created order', () => {
    const result = canTransition('Created', 'Confirmed', ['Customer']);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not permitted/);
  });

  test('Warehouse can pack a Confirmed order', () => {
    expect(canTransition('Confirmed', 'Packed', ['Warehouse']).ok).toBe(true);
  });

  test('cannot skip a step (Created -> Packed)', () => {
    const result = canTransition('Created', 'Packed', ['SalesRep']);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Expected 'Confirmed'/);
  });

  test('Admin can move any valid next-step transition', () => {
    expect(canTransition('Packed', 'Shipped', ['Admin']).ok).toBe(true);
  });

  test('cannot transition once Delivered (terminal state)', () => {
    const result = canTransition('Delivered', 'Shipped', ['Admin']);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/terminal/);
  });
});

describe('state-machine: canCancel', () => {
  test('Customer can cancel a Created order', () => {
    expect(canCancel('Created', ['Customer']).ok).toBe(true);
  });

  test('Customer cannot cancel a Packed order', () => {
    const result = canCancel('Packed', ['Customer']);
    expect(result.ok).toBe(false);
  });

  test('Admin can cancel a Packed order', () => {
    expect(canCancel('Packed', ['Admin']).ok).toBe(true);
  });

  test('cannot cancel an already Delivered order, even as Admin', () => {
    expect(canCancel('Delivered', ['Admin']).ok).toBe(false);
  });
});

describe('state-machine: nextStatus', () => {
  test('returns the correct next step in the happy path', () => {
    expect(nextStatus('Created')).toBe('Confirmed');
    expect(nextStatus('Shipped')).toBe('Delivered');
  });

  test('returns null for terminal/unknown states', () => {
    expect(nextStatus('Delivered')).toBeNull();
    expect(nextStatus('Cancelled')).toBeNull();
  });
});
