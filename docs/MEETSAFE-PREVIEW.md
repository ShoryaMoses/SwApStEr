# MeetSafe simulated preview

Open `/meetsafe` from **MeetSafe Demo** in the account navigation. It is a public,
frontend-only demo using a fictional VR Headset, $850 agreement, Demo Buyer and
Demo Seller. No real account, negotiation ID, private constraint, email, or
transaction is passed into it. No packages, backend changes or environment
variables are required.

## 60–90-second walkthrough

1. Click **Run MeetSafe Demo**. Seller View opens with a future public pickup
   proposal prefilled (two days from this browser’s current date).
2. Click **Propose pickup**. Optionally save “Blue hoodie, black headset case”
   as fictional recognition details.
3. Switch to **Buyer View** and **Accept pickup terms**. Pickup is now scheduled.
4. Reveal the demo code and copy it. Switch to **Seller View**, paste the code,
   and click **Verify demo code**. An incorrect code fails; a valid code works once.
5. Click **I handed over the item.** The exchange is still incomplete.
6. Switch to Buyer View and click **I received and inspected the item.** Only
   now does the exchange become completed and ratings unlock.
7. Submit a buyer review. Switch to Seller View and submit its independent review.
   The final summary displays both simulated reviews.
8. **Reset Demo** clears all events, descriptions and reviews and creates a new
   session/code. Refresh returns to the introductory screen.

To show alternatives, edit pickup terms before completion. A new proposal clears
previous acceptance, verification and handoff state; both participants must accept
the new revision. Proposing counts as the author’s acceptance. Dates and times are
validated in the browser’s local timezone, including rejection of past/impossible
values. Location safety is not verified; use fictional public locations only.

**Report an Issue** stores a selected reason locally, blocks verification and
completion, and clears handoff confirmations. Simulated resolution requires both
participants to confirm handoff again. Cancellation stops further progress until
reset. New issues/rescheduling are unavailable after completion; post-exchange
support is outside this prototype.

## Boundaries

- Role switching is two simulated people in one browser, not authentication or
  security isolation. Recognition details are visible only in this in-memory demo.
- Codes are inspectable frontend state, not proof of identity or delivery. They
  are marked DEMO, bound to the demo session/proposal revision, and redeemed once.
  Real verification needs server-generated, expiring, rate-limited,
  participant-bound, single-use tokens. No such production system is claimed.
- No payment, notifications, location tracking, support tickets, public reviews,
  reputation changes, or writes to marketplace APIs occur.
- Meet in a well-lit public place, inspect the item, confirm deal details, and
  never share passwords, OTPs or banking credentials. These are general reminders,
  not a guarantee of safety.

## Local verification

```sh
.venv/bin/python frontend/tests/support/run-production-preview.py
.venv/bin/python frontend/tests/support/run-account-marketplace.py
.venv/bin/python frontend/tests/support/run-account-marketplace.py --beta
git diff --check
```

The production runner builds a temporary frontend without local credentials,
checks TypeScript, and tests MeetSafe, Business and homepage behavior. MeetSafe
browser tests cover desktop/mobile completion and assert no fetch/XHR or write
requests during the flow. Pure state tests cover invalid actions, rescheduling,
code reuse, independent handoffs, issue handling, rating restrictions and reset.
The account runners use synthetic accounts and temporary SQLite only; run those
two sequentially because they share local ports.
