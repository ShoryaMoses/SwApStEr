"""Beta security/configuration checks; all database and Auth access stays local/mocked."""
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi.testclient import TestClient
import pytest
from backend import beta
from backend.main import app

ROOT=Path(__file__).resolve().parents[2]


@pytest.fixture(autouse=True)
def isolated_limits():
    beta.limiter.clear()
    yield
    beta.limiter.clear()


def test_limiter_is_atomic_bounded_and_expires():
    tick=[0]
    limiter=beta.RateLimiter(clock=lambda:tick[0])
    with ThreadPoolExecutor(max_workers=8) as pool:
        assert sum(pool.map(lambda _:limiter.allow('same',10),range(60)))==10
    tick[0]=61
    assert limiter.allow('same',10)
    for key in range(2047):assert limiter.allow(key,1)
    assert not limiter.allow('overflow',1)
    assert len(limiter.buckets)==2048


@pytest.mark.parametrize('path',['/listings','/listings/1','/students','/demo/session','/demo/judge/1','/negotiations','/b2b','/docs','/openapi.json'])
def test_production_legacy_paths_fail_even_with_overrides(monkeypatch,path):
    monkeypatch.setenv('APP_ENV','production');monkeypatch.setenv('PUBLIC_DEMO_MODE','true')
    with TestClient(app) as client:
        assert client.get(path).status_code==404
        assert client.post(path,json={}).status_code==404
        assert client.get('/health').json()=={'status':'ok'}


def test_beta_public_browse_requires_token_and_allowlist(monkeypatch):
    monkeypatch.setenv('BETA_ACCESS_ENABLED','true')
    monkeypatch.setenv('ENABLE_ACCOUNT_MARKETPLACE','true')
    monkeypatch.setenv('BETA_ALLOWED_USER_IDS','')
    with TestClient(app) as client:
        assert client.get('/marketplace/listings').status_code==401
        assert client.get('/marketplace/listings',headers={'Authorization':'Bearer bad'}).status_code in (401,503)
    monkeypatch.setenv('BETA_ALLOWED_USER_IDS','invalid-id')
    with TestClient(app) as client:assert client.get('/marketplace/listings').status_code==503


@pytest.mark.parametrize('origin',['*','http://remote.example.invalid','https://a.example.invalid/path','https://a.example.invalid/','https://user:secret@a.example.invalid','https://*.example.invalid','https://a.example.invalid:bad'])
def test_production_cors_rejects_unsafe_origins(monkeypatch,origin):
    monkeypatch.setenv('APP_ENV','production');monkeypatch.setenv('CORS_ALLOWED_ORIGINS',origin)
    with pytest.raises(ValueError):beta.cors_origins()


def test_explicit_cors_preflight_and_no_forwarded_ip_bypass(monkeypatch):
    monkeypatch.setenv('BETA_ACCESS_ENABLED','true')
    with TestClient(app) as client:
        response=client.options('/marketplace/listings',headers={'Origin':'http://localhost:3000','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'})
        assert response.status_code==200 and response.headers['access-control-allow-origin']=='http://localhost:3000'
        assert client.options('/marketplace/listings',headers={'Origin':'https://attacker.example.invalid','Access-Control-Request-Method':'POST'}).status_code==400
        for _ in range(600):assert beta.limiter.allow(('edge','testclient'),600)
        response=client.get('/auth/me',headers={'X-Forwarded-For':'1.2.3.4'})
        assert response.status_code==429 and response.headers['retry-after']=='60'
        assert client.get('/health').status_code==200


def test_chunked_body_is_bounded_even_without_content_length(monkeypatch):
    monkeypatch.setenv('BETA_ACCESS_ENABLED','true')
    with TestClient(app) as client:
        response=client.post('/marketplace/listings',content=iter([b'x'*40000,b'x'*40000]))
        assert response.status_code==413


def test_production_entrypoint_validates_without_connecting_or_initializing():
    env=dict(os.environ,APP_ENV='production',DATABASE_URL='postgresql://synthetic:synthetic@db.example.invalid/postgres?sslmode=require',DATABASE_POOL_MODE='session',BETA_ACCESS_ENABLED='true',BETA_ALLOWED_USER_IDS='',CORS_ALLOWED_ORIGINS='https://frontend.example.invalid',SUPABASE_URL='https://auth.example.invalid',SUPABASE_PUBLISHABLE_KEY='sb_publishable_synthetic',AI_PROVIDER='mock')
    code="""
from unittest.mock import patch
with patch('psycopg.connect',side_effect=AssertionError('Unexpected connection')), patch('sqlalchemy.schema.MetaData.create_all',side_effect=AssertionError('Unexpected DDL')):
    import backend.production
"""
    subprocess.run([sys.executable,'-c',code],env=env,cwd=ROOT,check=True,capture_output=True)


def test_production_rejects_sqlite_before_any_initialization(monkeypatch):
    from backend.deployment import validate
    monkeypatch.setenv('APP_ENV','production');monkeypatch.setenv('DATABASE_URL','sqlite:///should-not-exist.db')
    with pytest.raises(ValueError,match='PostgreSQL'):validate()
