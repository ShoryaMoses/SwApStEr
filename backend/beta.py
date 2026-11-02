"""Small, single-worker invited beta. No credentials, emails or records stored here."""
from collections import OrderedDict
import os
import threading
import time
from urllib.parse import urlsplit
from uuid import UUID

from fastapi import Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from backend.auth import bearer, authenticated_user


def deployed():
    return os.getenv('APP_ENV','development') != 'development'


def beta_enabled():
    return deployed() or os.getenv('BETA_ACCESS_ENABLED','false') == 'true'


def invited_ids():
    values={part.strip() for part in os.getenv('BETA_ALLOWED_USER_IDS','').split(',') if part.strip()}
    if len(values)>100 or any(str(UUID(value))!=value or UUID(value).int==0 for value in values):
        raise ValueError('Invalid beta account configuration.')
    return values


def cors_origins():
    value=os.getenv('CORS_ALLOWED_ORIGINS','' if deployed() else 'http://localhost:3000')
    origins=[part.strip() for part in value.split(',') if part.strip()]
    if deployed() and not origins:raise ValueError('Explicit HTTPS frontend origins are required.')
    for origin in origins:
        try:
            url=urlsplit(origin)
            _=url.port
        except ValueError:raise ValueError('Invalid frontend origin configuration.') from None
        if not url.hostname or '*' in url.hostname or any(c.isspace() for c in origin) or url.username or url.password or url.path or url.query or url.fragment or (url.scheme!='https' if deployed() else url.scheme not in {'http','https'}):
            raise ValueError('Invalid frontend origin configuration.')
    return origins


class RateLimiter:
    """Bounded fixed-window limiter. A single worker/instance is a beta requirement."""
    def __init__(self,clock=time.monotonic):
        self.clock=clock
        self.lock=threading.Lock()
        self.buckets=OrderedDict()
    def allow(self,key,limit):
        with self.lock:
            now=self.clock()
            for old in [key for key,(start,_) in self.buckets.items() if start+60<=now]:
                del self.buckets[old]
            start,count=self.buckets.get(key,(now,0))
            if now>=start+60:start,count=now,0
            if count>=limit:return False
            if key not in self.buckets and len(self.buckets)>=2048:
                return False # Never evict active buckets to allow a fresh attack identity.
            self.buckets[key]=(start,count+1)
            return True
    def clear(self):
        with self.lock:self.buckets.clear()


limiter=RateLimiter()


def limited(key,limit):
    if not limiter.allow(key,limit):
        raise HTTPException(429,'Too many requests. Wait one minute before retrying.',headers={'Retry-After':'60','Cache-Control':'private, no-store'})


def beta_access(request:Request,credentials=Depends(bearer)):
    if not beta_enabled():return None
    try:allowed=invited_ids()
    except (ValueError,TypeError,AttributeError):raise HTTPException(503,'Beta access is unavailable.') from None
    user=authenticated_user(credentials)
    if user.id not in allowed:
        raise HTTPException(403,'Beta access is by invitation.',headers={'Cache-Control':'private, no-store'})
    limited(('read',user.id),180)
    if request.method not in {'GET','HEAD','OPTIONS'}:
        limited(('write',user.id),60)
        if request.url.path.endswith('/advance'):limited(('inference',user.id),30)
        if request.url.path in {'/marketplace/listings','/marketplace/negotiations'}:limited(('create',user.id),10)
    return user


class DeploymentGuard:
    def __init__(self,app):self.app=app
    async def __call__(self,scope,receive,send):
        if scope['type']=='http' and beta_enabled():
            path=scope.get('path','')
            if deployed() and path!='/health' and path!='/auth/me' and not path.startswith('/marketplace/'):
                await JSONResponse({'detail':'Not found.'},status_code=404)(scope,receive,send);return
            if path!='/health' and scope['method']!='OPTIONS':
                # Deliberately ignore client-supplied forwarding headers. Render's
                # proxy address may form a shared bucket; keep this cap generous.
                client=(scope.get('client') or ('unknown',0))[0]
                if not limiter.allow(('edge',client),600):
                    await JSONResponse({'detail':'Too many requests. Wait one minute before retrying.'},status_code=429,headers={'Retry-After':'60','Cache-Control':'private, no-store'})(scope,receive,send);return
                length=dict(scope.get('headers',[])).get(b'content-length')
                if length:
                    try:oversized=int(length)>65536
                    except ValueError:oversized=True
                    if oversized:
                        await JSONResponse({'detail':'Request body is too large.'},status_code=413)(scope,receive,send);return
            if scope['method'] in {'POST','PUT','PATCH','DELETE'}:
                chunks=[];size=0
                while True:
                    message=await receive()
                    if message['type']=='http.disconnect':return
                    size+=len(message.get('body',b''))
                    if size>65536:
                        await JSONResponse({'detail':'Request body is too large.'},status_code=413)(scope,receive,send);return
                    chunks.append(message)
                    if not message.get('more_body',False):break
                original=receive
                async def replay():return chunks.pop(0) if chunks else await original()
                receive=replay
        await self.app(scope,receive,send)
