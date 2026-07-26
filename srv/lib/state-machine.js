'use strict';

/**
 * Order lifecycle:
 *   Created -> Confirmed -> Packed -> Shipped -> Delivered
 *   Created/Confirmed -> Cancelled (Admin can cancel from any non-terminal state)
 *
 * Kept as pure functions (no cds import) so it can be unit tested in isolation
 * without spinning up a CAP server.
 */

const TRANSITIONS = {
  Created:   { next: 'Confirmed', allowedRoles: ['SalesRep', 'Admin'] },
  Confirmed: { next: 'Packed',    allowedRoles: ['Warehouse', 'Admin'] },
  Packed:    { next: 'Shipped',   allowedRoles: ['Warehouse', 'Admin'] },
  Shipped:   { next: 'Delivered', allowedRoles: ['Warehouse', 'SalesRep', 'Admin'] }
};

const TERMINAL_STATES = ['Delivered', 'Cancelled'];

// States from which cancellation is still allowed for non-admin roles
const CANCELLABLE_FROM = ['Created', 'Confirmed'];

function hasAnyRole(userRoles = [], allowedRoles = []) {
  return allowedRoles.some(r => userRoles.includes(r));
}

/**
 * Validates whether `currentStatus` can move to `targetStatus` for a user with `userRoles`.
 * Returns { ok: true } or { ok: false, reason }
 */
function canTransition(currentStatus, targetStatus, userRoles = []) {
  if (TERMINAL_STATES.includes(currentStatus)) {
    return { ok: false, reason: `Order is already in terminal state '${currentStatus}'` };
  }

  const rule = TRANSITIONS[currentStatus];
  if (!rule) {
    return { ok: false, reason: `Unknown current status '${currentStatus}'` };
  }

  if (rule.next !== targetStatus) {
    return { ok: false, reason: `Cannot go from '${currentStatus}' to '${targetStatus}'. Expected '${rule.next}'` };
  }

  if (!hasAnyRole(userRoles, rule.allowedRoles) && !userRoles.includes('Admin')) {
    return { ok: false, reason: `Role(s) [${userRoles.join(', ')}] not permitted to move order from '${currentStatus}' to '${targetStatus}'` };
  }

  return { ok: true };
}

/**
 * Validates whether an order in `currentStatus` can be cancelled by a user with `userRoles`.
 */
function canCancel(currentStatus, userRoles = []) {
  if (TERMINAL_STATES.includes(currentStatus)) {
    return { ok: false, reason: `Order is already in terminal state '${currentStatus}'` };
  }
  if (userRoles.includes('Admin')) {
    return { ok: true };
  }
  if (!CANCELLABLE_FROM.includes(currentStatus)) {
    return { ok: false, reason: `Order can no longer be cancelled once it is '${currentStatus}'. Contact an Admin.` };
  }
  return { ok: true };
}

/** Returns the next status in the happy-path flow, or null if terminal/unknown */
function nextStatus(currentStatus) {
  return TRANSITIONS[currentStatus]?.next || null;
}

module.exports = { TRANSITIONS, TERMINAL_STATES, CANCELLABLE_FROM, canTransition, canCancel, nextStatus };
