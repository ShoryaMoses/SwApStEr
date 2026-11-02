"""Independent deterministic policy v1 for NEW account mock negotiations.

One turn is one agent message, not a buyer/seller round. Each policy receives
only its principal's constraints plus public offers. No market-value inference.
Legacy records keep the original MockProvider branch. See docs/NEGOTIATION-POLICY.md.
"""
from decimal import Decimal, ROUND_HALF_UP
from backend.models.schemas import Action

CENT = Decimal('0.01')


def decide(c):
    own, last = c['private'], c.get('last_offer')
    buyer = c['role'] == 'buyer'
    ask = Decimal(c['listing']['price'])
    boundary = min(Decimal(own['maximum']), ask) if buyer else Decimal(own['minimum'])
    anchor = min(Decimal(own['target']), boundary) if buyer else ask
    remaining = c['turn_budget'] - c['turn_index']
    history = c['history']
    prior = [Decimal(m['terms']['price']) for m in history
             if m['role'] == c['role'] and m.get('terms') and m['action'] in ('OFFER', 'COUNTER')]
    opponent = [Decimal(m['terms']['price']) for m in history
                if m['role'] != c['role'] and m.get('terms')]
    own_slots = (c['turn_budget'] + (1 if buyer else 0)) // 2
    progress = Decimal(c['own_turn']) / max(1, own_slots - 1)
    # Seller defends asking price first; buyer starts at the requested target.
    fraction = min(Decimal('.9'), progress * Decimal('.9')) if buyer else min(Decimal('.85'), Decimal('.1') + progress * Decimal('.75'))
    # A stationary opponent earns less concession, not an automatic midpoint.
    if len(opponent) >= 2 and opponent[-1] == opponent[-2]:
        fraction *= Decimal('.8')
    target = (anchor + (boundary - anchor) * fraction).quantize(CENT, rounding=ROUND_HALF_UP)
    target = min(boundary, max(anchor, target)) if buyer else max(boundary, min(anchor, target))
    if prior:
        target = max(prior[-1], target) if buyer else min(prior[-1], target)
    incoming = Decimal(last['price']) if last else None
    affordable = incoming is not None and (incoming <= boundary if buyer else boundary <= incoming <= ask)
    attractive = affordable and (incoming <= target if buyer else incoming >= target)
    housing = bool(c['listing'].get('housing'))
    price_token = '{price}/month' if housing else '{price}'
    if affordable and (attractive or remaining == 1):
        return Action(action='ACCEPT', terms=last,
                      message=f'I accept {price_token} on the proposed terms. Both parties can review the proposed agreement.')
    if remaining <= 1:
        return Action(action='REJECT', message='I cannot agree to the outstanding terms. We should end this negotiation without an agreement.')
    if incoming is not None:
        target = min(target, incoming) if buyer else max(target, incoming)
    # A single explicit hold is allowed; do not emit the same stance forever.
    if len(prior) >= 2 and prior[-1] == prior[-2] == target:
        return Action(action='REJECT', message='Further bargaining is not improving the terms. We should end this negotiation without an agreement.')
    holding = bool(prior and prior[-1] == target)
    if holding:
        message = f'My offer remains {price_token} on these terms. Can you improve your offer?'
    elif buyer:
        message = f'Would {price_token} work on these terms?' if not last else f'Thanks for considering my offer. I can move up to {price_token} on these terms.'
    else:
        message = f'That is below what my seller is seeking. I can offer {price_token} on these terms.'
    terms = dict(c['suggested_terms'], price=str(target))
    return Action(action='COUNTER' if last else 'OFFER', terms=terms, message=message)
