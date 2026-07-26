namespace com.acme.orderfulfillment;

using { cuid, managed } from '@sap/cds/common';

/**
 * Every business entity carries a `tenant` column.
 * It is set automatically on CREATE from the JWT (zid claim) / mocked user
 * and enforced on every READ/WRITE via a handler in srv/lib/tenant.js.
 * This is application-level (logical) multi-tenancy — see README for how
 * to graduate to full SAP BTP MTX (@sap/cds-mtxs) later.
 */
entity Customers : cuid, managed {
  name    : String(111) not null;
  email   : String(111);
  tenant  : String(36)  @readonly;
  orders  : Association to many Orders on orders.customer = $self;
}

entity Warehouses : cuid, managed {
  name     : String(111) not null;
  location : String(111);
  tenant   : String(36)  @readonly;
}

entity Orders : cuid, managed {
  tenant       : String(36) @readonly;
  customer     : Association to Customers;
  warehouse    : Association to Warehouses;
  status       : String(20) default 'Created';
  items        : Composition of many OrderItems on items.order = $self;
  totalAmount  : Decimal(15,2);
  currency     : String(3) default 'USD';
  paymentRef   : String(60);
  shippingRef  : String(60);
  cancelReason : String(255);
}

entity OrderItems : cuid {
  order     : Association to Orders;
  product   : String(111) not null;
  quantity  : Integer default 1;
  unitPrice : Decimal(15,2);
}

/** Valid order lifecycle states — enforced in code by srv/lib/state-machine.js */
type OrderStatus : String(20) enum {
  Created; Confirmed; Packed; Shipped; Delivered; Cancelled;
};
