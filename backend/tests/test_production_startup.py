"""Exercise Uvicorn's real production import and lifespan in a fresh process.

No listening socket, hosted connection, environment-file edits, or database writes.
Only the diagnostic child is mocked; production validation and lifespan run.
"""
import os
from pathlib import Path
import subprocess
import sys

import pytest


@pytest.mark.parametrize('mode', ['success', 'failure', 'timeout', 'disabled'])
def test_uvicorn_production_entrypoint_startup(mode):
    env = {
        'PATH': os.environ.get('PATH', ''),
        'APP_ENV': 'production',
        'DATABASE_URL': 'postgresql://synthetic:synthetic@db.example.invalid/postgres?sslmode=require',
        'DATABASE_POOL_MODE': 'session',
        'BETA_ACCESS_ENABLED': 'true',
        'BETA_ALLOWED_USER_IDS': '',
        'ENABLE_ACCOUNT_MARKETPLACE': 'false',
        'AI_PROVIDER': 'mock',
        'CORS_ALLOWED_ORIGINS': 'https://frontend.example.invalid',
        'SUPABASE_URL': 'https://auth.example.invalid',
        'SUPABASE_PUBLISHABLE_KEY': 'sb_publishable_synthetic',
        'SUPABASE_AUTH_LEGACY_HS256': 'false',
        'RUN_STARTUP_DB_SECURITY_CHECK': 'false' if mode == 'disabled' else 'true',
        'TEST_STARTUP_MODE': mode,
    }
    code = r"""
import asyncio
import io
import json
import logging
import os
from unittest.mock import AsyncMock, Mock, patch

import httpx
import uvicorn
from uvicorn.lifespan.on import LifespanOn

mode = os.environ['TEST_STARTUP_MODE']
# Never read local secrets, connect to a database, or create schema/seed records.
with patch('dotenv.load_dotenv'),      patch('psycopg.connect', side_effect=AssertionError('Database access forbidden')) as connect,      patch('sqlalchemy.schema.MetaData.create_all', side_effect=AssertionError('DDL forbidden')) as ddl:
    config = uvicorn.Config('backend.production:app', host='0.0.0.0', port=8000,
                            workers=1, access_log=False, proxy_headers=False)
    config.load()
    from backend.production import app as production_app
    from backend.main import app as main_app
    from backend import startup_security as startup
    assert production_app is main_app
    child = Mock(returncode=1 if mode == 'failure' else 0)
    payload = {
        'connection': 'ok', 'migration': '0001_records', 'schema': 'baseline observed',
        'username': 'DO_NOT_PRINT', 'security': {
            'rls_enabled': True, 'owner': True, 'bypass_rls': True,
            'review_required': True, 'current_role_crud_grants': True,
            'privileges': {role: {'table': {p: role == 'current_user' for p in startup.CRUD}}
                           for role in ('current_user', 'anon', 'authenticated')},
        },
    }
    child.communicate = AsyncMock(return_value=(
        b'DO_NOT_PRINT' if mode == 'failure' else json.dumps(payload).encode(), None))
    child.wait = AsyncMock()
    if mode == 'timeout':
        child.returncode = None
        async def hung():
            await asyncio.Event().wait()
        child.communicate.side_effect = hung
        startup.TIMEOUT_SECONDS = .01
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    startup.LOGGER.addHandler(handler)

    async def exercise():
        lifecycle = LifespanOn(config)
        await lifecycle.startup()
        assert not lifecycle.should_exit
        assert not lifecycle.startup_failed
        try:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=config.loaded_app),
                                         base_url='http://testserver') as client:
                for _ in range(2):
                    assert (await client.get('/health')).json() == {'status': 'ok'}
                response = await client.get('/marketplace/listings')
                assert response.status_code == 404
                assert response.json()['detail'] == 'Account marketplace is not enabled.'
        finally:
            await lifecycle.shutdown()

    with patch.object(startup.asyncio, 'create_subprocess_exec', new_callable=AsyncMock,
                      return_value=child) as factory:
        asyncio.run(exercise())
        if mode == 'disabled':
            factory.assert_not_called()
        else:
            factory.assert_awaited_once()
            assert factory.call_args.args[1:] == (
                '-m', 'backend.commands.database_check', '--connect', '--security')
    lines = [line for line in stream.getvalue().splitlines() if line.startswith(startup.PREFIX)]
    assert len(lines) == (0 if mode == 'disabled' else 1)
    assert 'DO_NOT_PRINT' not in stream.getvalue()
    if lines:
        result = json.loads(lines[0].split(' ', 1)[1])
        assert result['status'] == {'success':'completed', 'failure':'failed', 'timeout':'timeout'}[mode]
        assert result['review_required'] is True
    if mode == 'timeout':
        child.kill.assert_called_once()
        child.wait.assert_awaited_once()
    connect.assert_not_called()
    ddl.assert_not_called()
"""
    result = subprocess.run(
        [sys.executable, '-c', code], cwd=Path(__file__).resolve().parents[2],
        env=env, capture_output=True, text=True, timeout=20,
    )
    assert 'DO_NOT_PRINT' not in result.stdout + result.stderr
    assert result.returncode == 0, result.stdout + result.stderr
