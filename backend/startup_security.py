"""Opt-in read-only startup diagnostic, isolated from application logging."""
import asyncio
from contextlib import asynccontextmanager
import json
import logging
import os
import subprocess
import sys

LOGGER = logging.getLogger('uvicorn.error')
TIMEOUT_SECONDS = 30
PREFIX = 'STARTUP_DB_SECURITY'
CRUD = ('SELECT', 'INSERT', 'UPDATE', 'DELETE')


def summary(result):
    """Only fixed enums and actual booleans may cross into server logs."""
    def enum(value, allowed):
        return value if isinstance(value, str) and value in allowed else 'unknown'

    def boolean(value):
        return value if type(value) is bool else None

    security = result.get('security', {})
    privileges = security.get('privileges', {})
    output = {
        'status': 'completed',
        'connection': enum(result.get('connection'), ('ok',)),
        'migration': enum(result.get('migration'), ('0001_records', 'unmarked', 'unexpected')),
        'schema': enum(result.get('schema'), ('baseline observed', 'review required')),
        'rls_enabled': boolean(security.get('rls_enabled')),
        'runtime_owner': boolean(security.get('owner')),
        'runtime_bypasses_rls': boolean(security.get('bypass_rls')),
        'table_crud': {
            role: {permission: boolean(privileges.get(role, {}).get('table', {}).get(permission))
                   for permission in CRUD}
            for role in ('current_user', 'anon', 'authenticated')
        },
        'runtime_crud_and_sequence_grants': boolean(security.get('current_role_crud_grants')),
    }
    # An owner/bypass role still needs review even when catalog grants look safe.
    output['review_required'] = (
        security.get('review_required') is not False
        or output['connection'] != 'ok'
        or output['schema'] != 'baseline observed'
        or output['rls_enabled'] is not True
        or output['runtime_owner'] is not False
        or output['runtime_bypasses_rls'] is not False
        or any(value is None for grants in output['table_crud'].values() for value in grants.values())
    )
    return output


async def run_startup_check():
    if os.getenv('APP_ENV') != 'production' or os.getenv('RUN_STARTUP_DB_SECURITY_CHECK') != 'true':
        return
    process = None
    output = {'status': 'failed', 'connection': 'unverified', 'review_required': True}
    try:
        # Separate process avoids changing the server's logging configuration.
        # The existing CLI suppresses driver logs and uses a read-only transaction.
        process = await asyncio.create_subprocess_exec(
            sys.executable, '-m', 'backend.commands.database_check', '--connect', '--security',
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        )
        stdout, _ = await asyncio.wait_for(process.communicate(), timeout=TIMEOUT_SECONDS)
        if process.returncode == 0:
            output = summary(json.loads(stdout))
    except asyncio.TimeoutError:
        output['status'] = 'timeout'
    except Exception:
        # Never log stdout, exception details, environment or connection identifiers.
        pass
    finally:
        if process is not None and process.returncode is None:
            try:
                process.kill()
                await asyncio.wait_for(process.wait(), timeout=5)
            except Exception:
                pass
    level = logging.ERROR if output['status'] != 'completed' else logging.WARNING if output['review_required'] else logging.INFO
    LOGGER.log(level, '%s %s', PREFIX, json.dumps(output, sort_keys=True))


@asynccontextmanager
async def lifespan(app):
    # One execution per process startup, not per request or readiness probe.
    await run_startup_check()
    yield
