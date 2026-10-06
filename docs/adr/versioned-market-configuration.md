# Versioned market configuration

S05 is **P**, with **R** ownership attribute terminology and **V** reference visual
parity. It does not establish original-site geometry or production-provider access.

The API owns market policy. Actual current active platform administrator locks,
current market version, current city version when geography fields change, and
retained receipts govern edits. Geography and configuration change atomically.
Database guards require exact current active geography, actor and statement time;
immutable history records exact prior snapshots. Historical bootstrap snapshots
have no invented actor or timestamp. Public `/config` emits only shared typed policy
fields; history stays administrator-only. Configurable contact/app targets must be
HTTPS (or an international telephone number); absent targets render no links.

Known supported ISO currencies and IANA zones are validated. Area conversion is
presentation only, using Decimal and the square-metres source without a database
update. Recorded detail areas remain explicitly labelled original square metres.
Existing listing prices, posted charges, payments and lease terms retain original
currencies and exact decimals. Market currency changes do not rewrite these rows.
Rental defaults, mortgage assumptions, price presets, owner evidence and recurring
charge policy retain their existing consumer/API ports. Credential submissions
check current configured field lengths/expiry and retain the policy version;
previous reviewed credentials are not reinterpreted. Ownership attributes are
market descriptions and never imply equivalent tax rules across markets.

The isolated database contained four older `p06-market-*` synthetic configuration
fixtures without corresponding cities. Those exact orphan fixtures were preserved
in `s05_orphan_fixture_market_archive` before applying SQL 155. No real geography
was invented. Future fixtures must create geography before market configuration.
