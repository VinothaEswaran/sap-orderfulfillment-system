'use strict';

/**
 * Application-level (logical) multi-tenancy helper.
 *
 * In production (XSUAA), the tenant id arrives as the `zid` claim inside the
 * JWT and CAP exposes it as `cds.context.tenant` automatically.
 * In local/mocked auth, we attach `tenant` directly on the mocked user in
 * package.json (`cds.requires.auth.users.<name>.tenant`) and read it off
 * `req.user.tenant` as a fallback.
 *
 * Every handler that reads/writes business data calls getTenant(req) and
 * filters/stamps rows with it, so tenant A can never see tenant B's data
 * even though they share one SQLite file.
 */
function getTenant(req) {
  const tenant =
    req.tenant ||
    (req.user && req.user.attr && req.user.attr.tenant) ||
    (req.user && req.user.tenant) ||
    'unknown';
  return tenant;
}

module.exports = { getTenant };
