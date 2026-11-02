"""Startup verification never contacts a real database in this suite."""
import asyncio
import json
import logging
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi.testclient import TestClient
from backend.main import app

from backend import startup_security as startup


def report():
    return {
        'connection': 'ok', 'migration': '0001_records', 'schema': 'baseline observed',
        'security': {
            'rls_enabled': True, 'owner': True, 'bypass_rls': True,
            'current_role_crud_grants': True, 'review_required': False,
            'privileges': {role: {'table': {p: role == 'current_user' for p in startup.CRUD}}
                           for role in ('current_user', 'anon', 'authenticated')},
        },
    }


@pytest.fixture
def process(monkeypatch, caplog):
    monkeypatch.setenv('APP_ENV', 'production')
    monkeypatch.setenv('RUN_STARTUP_DB_SECURITY_CHECK', 'true')
    caplog.set_level(logging.INFO, logger='uvicorn.error')
    process = Mock(returncode=0)
    process.communicate = AsyncMock(return_value=(json.dumps(report()).encode(), None))
    process.wait = AsyncMock()
    factory = AsyncMock(return_value=process)
    monkeypatch.setattr(startup.asyncio, 'create_subprocess_exec', factory)
    return process, factory


def test_success_logs_only_sanitized_summary_once_per_startup(process, caplog):
    child, factory = process
    data = report()
    data['password'] = 'DO_NOT_PRINT'
    data['security']['username'] = 'DO_NOT_PRINT'
    child.communicate.return_value = (json.dumps(data).encode(), None)

    async def boot():
        async with startup.lifespan(None):
            pass
    asyncio.run(boot())
    factory.assert_awaited_once()
    assert factory.call_args.args[1:] == ('-m', 'backend.commands.database_check', '--connect', '--security')
    assert len(caplog.records) == 1
    assert 'DO_NOT_PRINT' not in caplog.text
    result = json.loads(caplog.records[0].message.split(' ', 1)[1])
    assert result['connection'] == 'ok' and result['migration'] == '0001_records'
    assert result['runtime_owner'] and result['runtime_bypasses_rls']
    assert result['review_required']  # Owner/bypass must not be mistaken for per-user RLS.
    assert all(result['table_crud']['current_user'].values())
    assert not any(result['table_crud']['anon'].values())


@pytest.mark.parametrize('flag,environment', [(None, 'production'), ('false', 'production'),
                                              ('TRUE', 'production'), ('true', 'development')])
def test_disabled_never_starts_process(process, monkeypatch, caplog, flag, environment):
    monkeypatch.setenv('APP_ENV', environment)
    if flag is None:
        monkeypatch.delenv('RUN_STARTUP_DB_SECURITY_CHECK')
    else:
        monkeypatch.setenv('RUN_STARTUP_DB_SECURITY_CHECK', flag)
    asyncio.run(startup.run_startup_check())
    process[1].assert_not_called()
    assert not caplog.records


@pytest.mark.parametrize('failure', ['exit', 'malformed', 'spawn', 'timeout'])
def test_failure_is_sanitized_and_does_not_prevent_startup(process, caplog, failure):
    child, factory = process
    if failure == 'exit':
        child.returncode = 1
        child.communicate.return_value = (b'DO_NOT_PRINT', None)
    elif failure == 'malformed':
        child.communicate.return_value = (b'DO_NOT_PRINT', None)
    elif failure == 'spawn':
        factory.side_effect = RuntimeError('DO_NOT_PRINT')
    else:
        child.returncode = None
        child.communicate.side_effect = asyncio.TimeoutError('DO_NOT_PRINT')

    async def boot():
        async with startup.lifespan(None):
            return 'started'
    assert asyncio.run(boot()) == 'started'
    assert 'DO_NOT_PRINT' not in caplog.text
    assert '"review_required": true' in caplog.text
    assert ('"status": "timeout"' if failure == 'timeout' else '"status": "failed"') in caplog.text
    if failure == 'timeout':
        child.kill.assert_called_once()
        child.wait.assert_awaited_once()


def test_arbitrary_nested_values_cannot_be_logged():
    data = report()
    data['migration'] = 'DO_NOT_PRINT'
    data['security']['owner'] = 'DO_NOT_PRINT'
    data['security']['privileges']['anon']['table']['SELECT'] = 'DO_NOT_PRINT'
    result = startup.summary(data)
    assert 'DO_NOT_PRINT' not in json.dumps(result)
    assert result['migration'] == 'unknown'
    assert result['runtime_owner'] is None
    assert result['review_required']


def test_actual_timeout_terminates_child(process, monkeypatch, caplog):
    child, _ = process
    child.returncode = None
    async def hung():
        await asyncio.Event().wait()
    child.communicate.side_effect = hung
    monkeypatch.setattr(startup, 'TIMEOUT_SECONDS', .01)
    asyncio.run(startup.run_startup_check())
    child.kill.assert_called_once()
    assert '"status": "timeout"' in caplog.text


def test_app_serves_health_after_failed_diagnostic_and_keeps_marketplace_disabled(process, monkeypatch):
    child, factory = process
    child.returncode = 1
    monkeypatch.setenv('ENABLE_ACCOUNT_MARKETPLACE', 'false')
    with TestClient(app) as client:
        assert client.get('/health').json() == {'status': 'ok'}
        assert client.get('/health').status_code == 200
        assert client.get('/marketplace/listings').status_code == 404
    factory.assert_awaited_once()
