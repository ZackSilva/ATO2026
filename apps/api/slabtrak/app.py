import logging
import re
import secrets
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, SecretStr, field_validator
from sqlalchemy import delete, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from slabtrak.config import Settings
from slabtrak.db import database
from slabtrak.inventory import inventory_router
from slabtrak.models import Account, LoginLimit, LoginSession
from slabtrak.photos import MAX_UPLOAD
from slabtrak.security import (
    check_password,
    csrf_token,
    digest,
    dummy_hash,
    normalize_username,
    password_hasher,
)

COOKIE = "slabtrak_session"
logger = logging.getLogger("slabtrak")


class LoginInput(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: SecretStr = Field(min_length=1, max_length=128)

    @field_validator("username")
    @classmethod
    def normalize(cls, value):
        return normalize_username(value)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    engine, sessions = database(settings)

    @asynccontextmanager
    async def lifespan(app):
        yield
        engine.dispose()

    app = FastAPI(
        title="SlabTrak API",
        version="0.1.0-demo.3",
        docs_url=None if settings.cookie_secure else "/docs",
        redoc_url=None,
        openapi_url=None if settings.cookie_secure else "/openapi.json",
        lifespan=lifespan,
    )
    app.state.sessions = sessions
    app.state.engine = engine

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request, exception):
        # Pydantic errors can contain the submitted input, including passwords.
        return JSONResponse({"detail": "Invalid request. Check the supplied fields."}, 422)

    @app.exception_handler(SQLAlchemyError)
    async def database_error(request, exception):
        logger.error("database_request_failed", extra={"path": request.url.path})
        return JSONResponse({"detail": "Storage is temporarily unavailable. Please retry."}, 503)

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        # Bound JSON bodies before parsing, including chunked requests.
        if request.method in {"POST", "PUT"} and request.url.path.startswith("/api/"):
            maximum = 4096 if request.url.path.startswith("/api/auth/") else 32768
            if request.method == "PUT" and re.fullmatch(
                r"/api/cards/[^/]+/photo", request.url.path
            ):
                maximum = MAX_UPLOAD
            body = bytearray()
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body) > maximum:
                    return JSONResponse({"detail": "Request is too large."}, 413)
            request._body = bytes(body)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        return response

    def db_session():
        with sessions() as session:
            yield session

    def trusted_origin(request: Request):
        if request.headers.get("origin") != settings.app_origin:
            raise HTTPException(403, "Request origin is not allowed.")

    def authenticated(request: Request, db: Annotated[Session, Depends(db_session)]):
        token = request.cookies.get(COOKIE, "")
        if not token or len(token) > 256:
            raise HTTPException(401, "Sign in to continue.")
        login = db.get(LoginSession, digest(token))
        if not login or login.expires_at <= datetime.now(UTC):
            raise HTTPException(401, "Sign in to continue.")
        account = db.get(Account, login.account_id)
        if not account:
            raise HTTPException(401, "Sign in to continue.")
        return account, login, token

    def mutation(
        request: Request,
        identity: Annotated[tuple, Depends(authenticated)],
        _: Annotated[None, Depends(trusted_origin)],
    ):
        if not secrets.compare_digest(
            request.headers.get("x-csrf-token", ""), csrf_token(identity[2])
        ):
            raise HTTPException(403, "Security check failed. Refresh and try again.")
        return identity

    app.include_router(inventory_router(db_session, authenticated, mutation, settings.photo_root))

    @app.get("/api/health")
    def health(db: Annotated[Session, Depends(db_session)]):
        # Confirms both database reachability and that the account migration exists.
        db.execute(select(Account.id).limit(1))
        return {"status": "ready"}

    @app.post("/api/auth/login", dependencies=[Depends(trusted_origin)])
    def login(
        data: LoginInput,
        request: Request,
        response: Response,
        db: Annotated[Session, Depends(db_session)],
    ):
        now = datetime.now(UTC)
        key = digest(data.username)
        # A shared database lock serializes attempts across all API processes.
        lock = int.from_bytes(bytes.fromhex(key[:16]), "big", signed=True)
        db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock})
        cutoff = now - timedelta(seconds=settings.login_window_seconds)
        db.execute(delete(LoginLimit).where(LoginLimit.started_at <= cutoff))
        limit = db.get(LoginLimit, key)
        if limit and limit.failures >= settings.login_attempts:
            retry_after = max(1, int((limit.started_at - cutoff).total_seconds()))
            db.commit()
            raise HTTPException(
                429,
                "Too many attempts. Try again later.",
                headers={"Retry-After": str(retry_after)},
            )
        account = db.scalar(select(Account).where(Account.username == data.username))
        valid = check_password(
            data.password.get_secret_value(), account.password_hash if account else dummy_hash
        )
        if not valid or not account:
            if not limit:
                limit = LoginLimit(key=key, failures=0, started_at=now)
                db.add(limit)
            limit.failures += 1
            db.commit()
            raise HTTPException(401, "Invalid username or password.")
        if limit:
            db.delete(limit)
        if password_hasher.check_needs_rehash(account.password_hash):
            account.password_hash = password_hasher.hash(data.password.get_secret_value())
        old_token = request.cookies.get(COOKIE, "")
        if old_token and len(old_token) <= 256:
            db.execute(delete(LoginSession).where(LoginSession.token_hash == digest(old_token)))
        db.execute(delete(LoginSession).where(LoginSession.expires_at <= now))
        token = secrets.token_urlsafe(32)
        expires = now + timedelta(hours=settings.session_hours)
        db.add(LoginSession(token_hash=digest(token), account_id=account.id, expires_at=expires))
        db.commit()
        response.set_cookie(
            COOKIE,
            token,
            httponly=True,
            secure=settings.cookie_secure,
            samesite="lax",
            max_age=settings.session_hours * 3600,
            path="/",
        )
        return {
            "username": account.username,
            "csrf_token": csrf_token(token),
            "expires_at": expires.isoformat(),
        }

    @app.get("/api/auth/me")
    def me(identity: Annotated[tuple, Depends(authenticated)]):
        account, login, token = identity
        return {
            "username": account.username,
            "csrf_token": csrf_token(token),
            "expires_at": login.expires_at.isoformat(),
        }

    @app.post("/api/auth/logout", dependencies=[Depends(trusted_origin)], status_code=204)
    def logout(
        request: Request,
        response: Response,
        identity: Annotated[tuple, Depends(authenticated)],
        db: Annotated[Session, Depends(db_session)],
    ):
        _, login, token = identity
        if not secrets.compare_digest(request.headers.get("x-csrf-token", ""), csrf_token(token)):
            raise HTTPException(403, "Security check failed. Refresh and try again.")
        db.execute(delete(LoginSession).where(LoginSession.token_hash == login.token_hash))
        db.commit()
        response.delete_cookie(
            COOKIE, path="/", secure=settings.cookie_secure, httponly=True, samesite="lax"
        )

    return app
