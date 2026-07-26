using com.acme.orderfulfillment as db from '../db/schema';

@requires: 'authenticated-user'
service OrderService {

  @odata.draft.enabled
  @restrict: [
    { grant: ['READ'],   to: ['Customer', 'SalesRep', 'Warehouse', 'Admin'] },
    { grant: ['CREATE'], to: ['Customer', 'SalesRep', 'Admin'] },
    { grant: ['UPDATE', 'DELETE'], to: ['SalesRep', 'Admin'] },
    // NOTE: bound custom actions must ALSO be granted here — CAP resolves a
    // bound action's restriction from its *parent entity's* @restrict list,
    // not (only) from an @requires on the action itself. Listing the action
    // name as the grant is the documented way to scope it to specific roles.
    { grant: ['confirmOrder'],       to: ['SalesRep', 'Admin'] },
    { grant: ['packOrder'],          to: ['Warehouse', 'Admin'] },
    { grant: ['shipOrder'],          to: ['Warehouse', 'Admin'] },
    { grant: ['deliverOrder'],       to: ['Warehouse', 'SalesRep', 'Admin'] },
    { grant: ['cancelOrder'],        to: ['Customer', 'SalesRep', 'Admin'] },
    { grant: ['reassignWarehouse'],  to: ['SalesRep', 'Admin'] }
  ]
  entity Orders as projection on db.Orders actions {
    action confirmOrder()  returns Orders;
    action packOrder()     returns Orders;
    action shipOrder()     returns Orders;
    action deliverOrder()  returns Orders;
    action cancelOrder(reason: String) returns Orders;
    action reassignWarehouse(warehouse_ID: UUID) returns Orders;
  };

  entity OrderItems as projection on db.OrderItems;

  @readonly
  entity Customers as projection on db.Customers;

  @restrict: [
    { grant: ['READ'], to: ['SalesRep', 'Warehouse', 'Admin'] },
    { grant: ['*'],    to: ['Admin'] }
  ]
  entity Warehouses as projection on db.Warehouses;

  /** Returns the ordered list of status transitions an order has gone through */
  function getOrderHistory(orderID: UUID) returns array of String;
}
