"""Pure deployment configuration validation; no connection or application import."""
import os
from backend.auth import auth_settings
from backend.beta import cors_origins, invited_ids
from backend.models.database_config import database_url

def validate():
    if os.getenv('APP_ENV')!='production':raise ValueError('APP_ENV=production is required.')
    url=database_url()
    if url.get_backend_name()!='postgresql' or url.query.get('sslmode') not in {'require','verify-ca','verify-full'}:
        raise ValueError('Encrypted PostgreSQL configuration is required.')
    if os.getenv('DATABASE_POOL_MODE','direct') not in {'direct','session'}:
        raise ValueError('Beta requires direct or session database pooling.')
    if os.getenv('BETA_ACCESS_ENABLED')!='true':raise ValueError('Beta access control must be enabled.')
    if os.getenv('AI_PROVIDER')!='mock':raise ValueError('This beta requires the labeled mock provider.')
    invited_ids()  # Empty means nobody has access; never allow all as a fallback.
    cors_origins()
    auth_settings()

