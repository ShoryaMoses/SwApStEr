"""Pure local coordinator/policy regressions: no hosted services or DB records."""
from copy import deepcopy
from decimal import Decimal
import json
import pytest
from backend.agents import negotiation_coordinator as coordinator
from backend.agents.mock_provider import MockProvider
from backend.tests.test_account_marketplace import listing_body


def setup(ask='85', minimum='50', target='50', maximum='80', budget=8):
    listing = dict(listing_body(type='Buy',price=ask,minimum=minimum),id=1,seller_id='seller',restrictions='Inspect at pickup')
    p = dict(listing_id=1,target=target,maximum=maximum,transaction='purchase',windows=listing['windows'],deadline=listing['available_until'],location='Public library')
    n = dict(id=1,listing_id=1,buyer_id='buyer',seller_id='seller',buyer='Buyer',seller='Seller',
             preferences=p,provider='mock',status='Negotiating',messages=[],offer=None,agreement=None,
             approvals={'buyer':False,'seller':False},turn=0,version=0,error=None,mock_policy='independent_v1',turn_budget=budget)
    return listing,n


def advance(l,n):
    return coordinator.advance(n,listing=l,persist=lambda x:x,project=lambda x:x,
        listing_projection=lambda x:{k:v for k,v in x.items() if k!='minimum'},mock_convergence=True)


def run(l,n):
    for _ in range(9):
        if n['status']!='Negotiating':break
        n=advance(l,n)
        assert not n.get('error'), n.get('error')
    return n


@pytest.mark.parametrize('budget',[1,2,3,4,6,8])
@pytest.mark.parametrize('prices',[
    ('85','50','50','80'),('85','50','85','85'),('100','90','50','80'),
    ('85','79','79','80'),('200','140','120','175'),('80.01','79.99','79.99','80'),
])
def test_price_limits_precision_monotonicity_and_bounded_termination(prices,budget):
    l,n=setup(*prices,budget=budget);n=run(l,n)
    assert n['turn']<=budget and n['status'] in ('Agreement proposed','No agreement')
    assert not any(n['approvals'].values())
    for role in ('buyer','seller'):
        offers=[]
        for m in n['messages']:
            assert not any(word in m['text'].lower() for word in ('minimum','maximum','students','middle'))
            if m['role']!=role or not m.get('terms'):continue
            p=Decimal(m['terms']['price']);assert p==p.quantize(Decimal('.01'))
            assert p<=Decimal(prices[3]) if role=='buyer' else Decimal(prices[1])<=p<=Decimal(prices[0])
            if m['action']!='ACCEPT':offers.append(p)
        assert offers==sorted(offers,reverse=role=='seller')
        assert all(not (offers[i]==offers[i+1]==offers[i+2]) for i in range(len(offers)-2))
    if n['agreement']:
        assert Decimal(prices[1])<=Decimal(n['agreement']['price'])<=Decimal(prices[3])
        assert n['messages'][-1]['action']=='ACCEPT'
        assert n['messages'][-1]['terms']==n['messages'][-2]['terms']
        assert coordinator.valid_proposal(n,listing=l)
    if Decimal(prices[1])>Decimal(prices[3]):assert n['agreement'] is None


def test_gta_bargains_and_full_asking_offer_can_be_accepted_immediately():
    l,n=setup();n=advance(l,n);assert Decimal(n['offer']['price'])==Decimal('50')
    n=advance(l,n);assert n['messages'][-1]['action']=='COUNTER'
    assert Decimal(n['offer']['price'])>Decimal('75')
    n=advance(l,n);assert Decimal('50')<Decimal(n['offer']['price'])<Decimal('80')
    n=run(l,n);assert n['status']=='Agreement proposed' and 3<n['turn']<=8
    assert [Decimal(m['terms']['price']) for m in n['messages']] == list(map(Decimal,['50','81.50','59','72.75','68','68']))
    l,full=setup(target='85',maximum='85');full=advance(l,advance(l,full))
    assert full['status']=='Agreement proposed' and full['turn']==2


def test_favorable_seller_offer_is_accepted_without_delay():
    l,n=setup();n=advance(l,n)
    terms=dict(n['offer'],price='50')
    n['messages'].append(dict(role='seller',action='COUNTER',terms=terms,text='Public offer'))
    n.update(offer=terms,turn=2)
    n=advance(l,n)
    assert n['messages'][-1]['action']=='ACCEPT' and n['agreement']['price']=='50'


def test_opponent_holds_change_policy_without_reading_opponent_private_limits(monkeypatch):
    captured=[];original=MockProvider.decide
    def spy(self,c):captured.append(deepcopy(c));return original(self,c)
    monkeypatch.setattr(MockProvider,'decide',spy)
    l,n=setup();run(l,n)
    for c in captured:
        assert ('minimum' not in json.dumps(c)) if c['role']=='buyer' else ('maximum' not in json.dumps(c))
    c=deepcopy(next(c for c in captured if c['role']=='seller' and c['own_turn']==1))
    changed=deepcopy(c)
    buyers=[m for m in changed['history'] if m['role']=='buyer']
    buyers[-1]['terms']['price']=buyers[-2]['terms']['price']
    changed['last_offer']=buyers[-1]['terms']
    assert original(MockProvider(),changed).terms.price>original(MockProvider(),c).terms.price
    # No counterpart constraints in either policy context; changing its bounds
    # cannot affect a decision with the same public history and own constraints.
    assert 'minimum' not in captured[0]['listing']


def test_invalid_pickup_and_location_cannot_be_accepted(monkeypatch):
    l,n=setup();n['preferences']['windows']=[{'start':'2030-01-01T10:00:00+00:00','end':'2030-01-01T11:00:00+00:00'}]
    assert run(l,n)['status']=='No agreement'
    from backend.models.schemas import Action
    for change in ({'location':'Another location'},{'pickup':'2030-01-01T10:00:00+00:00'}):
        l,n=setup();n=advance(l,n)
        monkeypatch.setattr(MockProvider,'decide',lambda self,c:Action(action='ACCEPT',terms=dict(c['last_offer'],**change),message='I accept {price} on these terms.'))
        n=advance(l,n);assert n['agreement'] is None and n['error']
        monkeypatch.undo()


def test_legacy_and_confirmed_records_are_not_rewritten(monkeypatch):
    monkeypatch.setenv('MAX_NEGOTIATION_TURNS','8')
    l,n=setup();n.pop('mock_policy');n.pop('turn_budget')
    n=advance(l,advance(l,n));assert n['status']=='Agreement proposed' and n['turn']==2
    n.update(status='Confirmed',approvals={'buyer':True,'seller':True})
    before=deepcopy(n);assert advance(l,n)==before


def test_budget_changes_do_not_change_versioned_in_progress_negotiations(monkeypatch):
    l,n=setup();n=advance(l,n);monkeypatch.setenv('MAX_NEGOTIATION_TURNS','2')
    n=run(l,n);assert n['status']=='Agreement proposed' and n['turn']>2
