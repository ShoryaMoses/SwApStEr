# SwApStEr Business preview

`/b2b` is a public, frontend-only fictional procurement simulation. It does not
use Business backend routes, Supabase, or the consumer marketplace API. All state
lives in React memory and resets on reload. Existing consumer access controls
remain independent. No environment variables or migrations are required.

## 90-second walkthrough

1. Open `/b2b`, click **Run Sample Demo**. Inspect three fictional sources,
   original quotes, shipping, delivery, MOQ and current comparison totals.
2. Horizon (Vietnam) is selected. Click **Start negotiation**, then **Advance
   negotiation**. The supplier counters at $10.40; the authorized maximum is $10.
3. Enter **10.40** in New unit limit and click **Confirm budget increase**.
   This records authorization for Horizon only. It does not approve a deal.
4. Click **Advance negotiation**. A valid proposal appears: $5,200 product cost
   plus $200 sample shipping, total **$5,400**.
5. Select China, start and advance. Pacific proposes $9.90 plus $600 shipping:
   **$5,550**. Horizon remains recommended despite its higher unit price.
   Toggle the scripted Mandarin/English preview if desired.
6. Select India, start and advance. Its $10.20 proposal exceeds its unchanged
   $10 limit. Choose **Keep My Current Budget**, **Try Another Supplier**, or
   cancel to demonstrate refusal without spending authorization.
7. Select Vietnam again. Review the history and proposal; click **Approve
   Proposed Deal**. Only a simulated approval badge and counter are created.
8. Click **Reset Demo** to replay, or create a custom sourcing request.

## Rules and limits

- Integer cents are used for monetary calculations; shipping counts toward the
  optional total budget. Totals exclude duties, taxes, inspections and insurance.
- Supplier quotes may exceed buyer limits; buyer offers and valid proposals may
  not. Supplier floors are never crossed. Two rounds reach the fictional final
  quote. Further negotiation explicitly declines further concessions.
- Budget changes require explicit confirmation, affect only the selected thread,
  preserve other authorizations, and are logged separately from final approval.
- The total-budget field applies to each candidate proposal, not cumulative spend
  across approvals. Multiple approvals are demo states, not a purchasing ledger.
- Supplier internal limits are omitted from UI and messages, but browser source
  is inspectable. Do not enter confidential business information. This is not a
  secure multi-party agent system.
- All suppliers, quality indicators, source labels, translations and economics
  are illustrative. Arbitrary product names use the same sample economics.
- The parser supports the shown `Find … under $… delivered to … within … days`
  phrase, not general language understanding. Structured fields are authoritative.
- Quantity, delivery and country constraints are enforced. Preferred qualities
  are unverified; custom non-negotiable requirements block proposals. No claims
  of certification, real capacity or real-world product availability are made.
- No external marketplace sourcing, supplier messaging, live translation, LLM
  inference, payment, inventory reservation or contract signing is implemented.

## Verification

Run from the repository root:

```sh
.venv/bin/python frontend/tests/support/run-production-preview.py
.venv/bin/python frontend/tests/support/run-account-marketplace.py
.venv/bin/python frontend/tests/support/run-account-marketplace.py --beta
.venv/bin/python -m pytest backend/tests -q
git diff --check
```

The production runner builds a temporary frontend with blank Supabase configuration,
checks TypeScript, and runs production homepage and Business tests. Browser tests
exercise mobile/desktop escalation, supplier switching, approvals and reset, and
assert that the Business workflow issues no fetch/XHR or write requests. Run the
account runners sequentially because they use the same isolated local ports.
