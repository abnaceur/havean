# Mortgage arithmetic ownership and rounding

The calculation engine lives in the API geography/tools module. Contracts contains
strict input/output schemas and CSV escaping only; browsers request estimates
through the session BFF rather than calculating business results locally.

Amounts are bounded decimal strings, never floating money inputs. Nominal annual
rate is divided by 1200 to obtain the monthly fraction. Decimal.js uses a local
60-digit context and explicit ROUND_HALF_UP; unrelated modules keep their own
context. Equal-payment formula and its zero-rate branch follow specification §6.7.
Equal-principal uses a rounded principal installment. Every period's interest is
rounded to two decimals. Principal is capped by the current balance and cannot go
negative when cent rounding exceeds a tiny nominal installment. The final period
repays the remaining principal exactly. Returned method, annual rate, term and
first/final payments make the rounding assumptions explicit. This is a planning
estimate without tax/fee inclusion or a lender approval claim.

Known 120000 / 6% / 120-period equal-payment fixture: first 1332.25, final 1331.55,
interest 39869.30 and total repaid 159869.30 under these rules. The fixture was
independently evaluated with Python Decimal (60-digit precision, half-up cent
rounding); unit reconciliation uses integer cents. Zero rate repays 1000 each month
for both methods. Tiny and large long-term loans reconcile without negative rows
or an increasing balance. Invalid amount types, zero principal/term, negative or
nonfinite rate, excessive amounts and unknown fields are rejected.

## Market notes and export snapshot

The estimate API resolves the selected active city and public market configuration
in one query, returning actual currency, configuration version and configured
planning notes alongside its calculation. SQL 105 and seed defaults record proposed
English fee-exclusion copy; administrators can edit that note with the existing
versioned city settings flow. Omitting the new optional setting preserves it.

CSV formatting uses the frozen typed API result, not a recalculation. The file
includes first/final payment, totals, currency, method/rate/term, assumptions,
market notes/version and every schedule row. The consumer view shows the planning
notes; configuration version remains export provenance. An optional title is
length bounded, quoted and formula-neutralized, including whitespace prefixes.
UTF-8 BOM preserves Unicode interoperability. No account identity/contact fields
are included by default. This formatter makes no financial decisions.
