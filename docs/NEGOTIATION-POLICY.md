# Independent deterministic account negotiation policy v1

New real-account negotiations created with `provider=mock` store
`mock_policy=independent_v1` and the configured turn budget in their existing JSON
record. No schema migration is required. Existing records without that marker
continue through the legacy provider/convergence branch. Confirmed records and
historical messages are never replayed or rewritten. Ollama, the separate campus
demo, and the frontend Business simulation are unchanged.

## Cause and rules

The old mock seller accepted any incoming price greater than or equal to its
minimum. Account convergence also drove offers to reservation boundaries. This
made the minimum an effective early acceptance target.

The new policy uses the existing separate buyer/seller contexts:

- Buyer sees its target/maximum and public listing/history, never seller minimum.
- Seller sees its ask/minimum and public history, never buyer maximum.
- Only the coordinator has both constraints for validation; policy inputs do not.

One turn means **one agent message**. The existing supported configuration is
1–8 turns (`MAX_NEGOTIATION_TURNS`, default 8). New mock negotiations retain their
creation-time budget; configuration changes affect future negotiations. Legacy
negotiations retain their existing dynamic-budget semantics.

Each agent calculates its own acceptance/counter threshold from its own anchor
and reservation boundary. Buyer starts at its requested target, capped by its
maximum and the public ask, and concedes up to 90% of its own range across its
available turns. Seller starts 10% below its ask within its own range and gradually
concedes up to 85%. These are deterministic policy parameters, not market-value
estimates. If the opponent holds the same price, the concession fraction is reduced
by 20%. Prior own offers prevent backward movement; all prices use cent precision.

Accept an incoming offer when it satisfies the principal’s boundary and is at
least as favorable as that turn’s threshold. On the final remaining message,
accept a valid incoming offer rather than lose it, or reject an unacceptable one.
Thus a two-message budget may still accept a boundary offer immediately: that is
an explicit deadline tradeoff, not the normal eight-message policy. A full-ask
buyer offer or sufficiently favorable seller offer can be accepted early.

Counters never cross the outstanding public offer. A single justified hold may
repeat a stance; a third identical own offer is replaced with rejection. There is
no guaranteed midpoint, guarantee of agreement, or access to the opponent’s
private range. Even an overlapping range can end without agreement, especially
with a very narrow overlap or a small turn budget. Old tests assuming forced
convergence were updated to test this deliberate behavior and null-term rejection.

All actions still pass unchanged coordinator checks for price, pickup location,
time windows, deadlines, rental duration, availability, and exact acceptance of
the outstanding offer. Agent acceptance produces only `Agreement proposed`.
Human review and independent authenticated approvals remain required. Listing
availability, finalization locks, CAS versions, and approval transactions are
unchanged. Public projections omit the internal policy marker and private values.
Messages use only validated public fact tokens and general marketplace language.

## Eight-message examples

For ask $85 / seller minimum $50 and buyer target $50 / maximum $80:

1. Buyer offers $50.
2. Seller counters $81.50.
3. Buyer moves to $59.
4. Seller counters $72.75.
5. Buyer moves to $68.
6. Seller accepts $68 for both parties’ review; no human approval is recorded.

For ask $200 / minimum $140 and target $120 / maximum $175, the different ranges
and public concessions yield a different path. Prices are not hard-coded by item
name, and the policy does not infer market value. Deterministic offers can convey
bargaining behavior; absence of explicit private fields is not a claim that a
counterparty can never infer anything from public prices.

## Deployment and rollback

Both backend (Render) and frontend (Vercel) require deployment after review:
backend for the new policy, frontend to remove MeetSafe links and its route.
No environment changes, database migration, credentials, or allowlist changes are
needed. Do not alter existing records to opt them in. Test new negotiations after
deployment; old in-progress negotiations intentionally retain their old policy.

A simple rollback to older code would not understand the new policy marker and
would change the behavior of new in-progress negotiations. Preserve the v1
implementation for those records when disabling its use for future negotiations;
do not rewrite their messages or approvals. No automatic rollout or rollback is
performed here. This remains deterministic mock negotiation, not live AI inference
or a proof of economically optimal bargaining.

MeetSafe has been removed; `/meetsafe` returns the normal Next.js 404. Only a
negative route/navigation regression retains its name.
