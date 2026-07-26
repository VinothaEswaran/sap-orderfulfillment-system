# SAP OrderFulfillment System (Extended)

An SAP CAP (Cloud Application Programming Model) project demonstrating a
production-shaped order fulfillment service: role-based auth, an order state
machine, tenant isolation, draft-enabled entities, custom actions/functions,
external mock integrations, and automated tests.

## Features

| Feature | Where |
|---|---|
| XSUAA auth (mocked locally) + JWT roles | `package.json` (`cds.requires.auth`), `xs-security.json` |
| Roles: Customer, SalesRep, Warehouse, Admin | `srv/order-service.cds` (`@requires`, `@restrict`) |
| Order state machine with per-role transitions | `srv/lib/state-machine.js`, wired in `srv/order-service.js` |
| Multi-tenancy (SaaS-style, logical) | `srv/lib/tenant.js`, `tenant` column on every entity |
| Draft-enabled entity + custom actions/functions | `@odata.draft.enabled` on `Orders`; `cancelOrder`, `reassignWarehouse`, `confirmOrder`, `packOrder`, `shipOrder`, `deliverOrder`, `getOrderHistory` |
| External payment/shipping mock integration | `mock-server/server.js`, `srv/lib/payment-client.js`, `srv/lib/shipping-client.js` |
| Unit + integration tests (`cds test` style) | `test/unit/*.test.js`, `test/integration/*.test.js` |

### A note on multi-tenancy (read this before an interview!)

This project implements **application-level / logical multi-tenancy**: every
entity has a `tenant` column, populated from the JWT / mocked user, and every
read is filtered by it in `srv/order-service.js`. This is a common, legitimate
pattern — but it is **not** the same as SAP BTP's full multi-tenancy stack
(`@sap/cds-mtxs`, SaaS Provisioning service, per-tenant HDI containers,
subscription/unsubscription flows). If asked, describe it exactly this way,
and mention that migrating to true MTX would mean adding `@sap/cds-mtxs`,
a `mtx/sidecar`, and a subscription flow via the SaaS Provisioning service.

## Project structure

```
SAP-OrderFulfillment-System/
├── package.json                 # CAP config, mocked auth users, scripts
├── xs-security.json             # XSUAA role/scope descriptor (for prod deploy)
├── jest.config.js
├── db/
│   ├── schema.cds               # Customers, Warehouses, Orders, OrderItems
│   └── data/                    # seed CSVs (Customers, Warehouses)
├── srv/
│   ├── order-service.cds        # service, roles, draft, custom actions/functions
│   ├── order-service.js         # implementation: tenancy, state machine, mocks
│   └── lib/
│       ├── state-machine.js     # pure, unit-testable transition rules
│       ├── tenant.js            # tenant extraction helper
│       ├── payment-client.js    # calls external payment mock (with fallback)
│       └── shipping-client.js   # calls external shipping mock (with fallback)
├── mock-server/
│   └── server.js                # standalone Express mock: /payment, /shipping
└── test/
    ├── unit/state-machine.test.js
    └── integration/order-service.test.js
```

### A CAP gotcha worth knowing for interviews

Bound custom actions (like `confirmOrder`) get their role restriction from
their **parent entity's `@restrict` list**, not from an `@requires` on the
action alone — unless the action name is explicitly listed as a `grant` in
the entity's `@restrict`. See the comment above the `Orders` entity in
`srv/order-service.cds`. This tripped up the first draft of this project and
is a good "what bug did you run into" interview answer.

## Prerequisites

- Node.js 18 or 20
- `npm install -g @sap/cds-dk` (optional but recommended, gives you the `cds` CLI globally)

## Setup

```bash
cd SAP-OrderFulfillment-System
npm install
npm run db:deploy     # creates db/orderfulfillment.db and loads seed data (Customers, Warehouses)
```

## Run it

Open **two terminals** in VS Code:

**Terminal 1 — external mock API** (payment + shipping):
```bash
npm run mock:external
# External payment/shipping mock listening on http://localhost:4100
```

**Terminal 2 — the CAP app**:
```bash
npm run watch
# serving OrderService { at: '/odata/v4/order' } ...
```

Or run both at once:
```bash
npm run dev
```

CAP will print a local index at `http://localhost:4004` with links to the
OData service metadata and a Fiori preview of the draft-enabled `Orders`
entity.

## Mocked users (local dev only — see `package.json`)

| Username | Password | Role | Tenant |
|---|---|---|---|
| alice | pass | Customer | t1 |
| bob   | pass | SalesRep | t1 |
| carol | pass | Warehouse | t1 |
| dave  | pass | Admin | t1 |
| erin  | pass | Customer | t2 |

Basic-auth is used locally (that's how `@sap/cds` mocked auth works). In
production, swap `cds.requires.auth.kind` to `xsuaa` (already wired via the
`[production]` profile in `package.json`) and deploy `xs-security.json` as
part of your MTA.

## Try it with curl

`Orders` is draft-enabled (Fiori-style). A `POST` creates a **draft**
(`IsActiveEntity=false`) — it must be activated before it's a real,
queryable record with a simple key. Fiori Elements does this automatically;
by hand it's one extra call:

```bash
# Alice (Customer, t1) creates a draft order
curl -u alice:pass -X POST http://localhost:4004/odata/v4/order/Orders \
  -H "Content-Type: application/json" \
  -d '{"totalAmount": 100, "currency": "USD"}'
# copy the "ID" from the response, e.g. ID=<ID>

# Activate the draft -> becomes a real order, payment gets authorized automatically
curl -u alice:pass -X POST "http://localhost:4004/odata/v4/order/Orders(ID=<ID>,IsActiveEntity=false)/OrderService.draftActivate"

# From here on, use the *active* key: Orders(ID=<ID>,IsActiveEntity=true)

# Bob (SalesRep, t1) confirms it
curl -u bob:pass -X POST "http://localhost:4004/odata/v4/order/Orders(ID=<ID>,IsActiveEntity=true)/OrderService.confirmOrder"

# Carol (Warehouse, t1) packs, then ships it
curl -u carol:pass -X POST "http://localhost:4004/odata/v4/order/Orders(ID=<ID>,IsActiveEntity=true)/OrderService.packOrder"
curl -u carol:pass -X POST "http://localhost:4004/odata/v4/order/Orders(ID=<ID>,IsActiveEntity=true)/OrderService.shipOrder"

# Alice trying to confirm her own order -> 403 Forbidden (wrong role)
curl -u alice:pass -X POST "http://localhost:4004/odata/v4/order/Orders(ID=<ID>,IsActiveEntity=true)/OrderService.confirmOrder"

# Erin (Customer, t2) can never see Alice's (t1) orders
curl -u erin:pass http://localhost:4004/odata/v4/order/Orders
```

## Tests

```bash
npm test               # everything
npm run test:unit      # pure state-machine logic, no server needed
npm run test:integration  # spins up a real in-memory CAP server via cds.test
```

The integration suite (`test/integration/order-service.test.js`) exercises:
- role-restricted transitions (Customer blocked from confirming, etc.)
- the full happy-path state machine (Created → Confirmed → Packed → Shipped)
- tenant isolation (tenant t2 user cannot see tenant t1 orders)
- Admin override cancellation from a non-Created state


