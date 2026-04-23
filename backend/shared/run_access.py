import base64
import hashlib
import hmac
import json
import os
import time


DEFAULT_TTL_SECONDS = 60 * 60 * 24


class RunAccessError(ValueError):
    pass


def issue_run_access_token(run_id: str, ttl_seconds: int = DEFAULT_TTL_SECONDS, user_id: str | None = None) -> tuple[str, int]:
    if not run_id:
        raise RunAccessError("run_id is required")

    expires_at = int(time.time()) + ttl_seconds
    payload = {
        "v": 1,
        "run_id": run_id,
        "exp": expires_at,
    }
    if user_id:
        payload["user_id"] = user_id
    payload_segment = _encode_segment(payload)
    signature_segment = _sign_segment(payload_segment)
    return f"{payload_segment}.{signature_segment}", expires_at


def verify_run_access_token(run_id: str, token: str, user_id: str | None = None) -> dict:
    if not run_id:
        raise RunAccessError("run_id is required")
    if not token:
        raise RunAccessError("run access token is required")

    try:
        payload_segment, signature_segment = token.split(".", 1)
    except ValueError as exc:
        raise RunAccessError("malformed run access token") from exc

    expected_signature = _sign_segment(payload_segment)
    if not hmac.compare_digest(signature_segment, expected_signature):
        raise RunAccessError("invalid run access token signature")

    payload = _decode_segment(payload_segment)
    payload_run_id = payload.get("run_id")
    expires_at = payload.get("exp")

    if payload_run_id != run_id:
        raise RunAccessError("run access token does not match the requested run")
    if user_id and payload.get("user_id") != user_id:
        raise RunAccessError("run access token does not match the authenticated user")
    if not isinstance(expires_at, int):
        raise RunAccessError("run access token expiration is invalid")
    if expires_at <= int(time.time()):
        raise RunAccessError("run access token has expired")

    return payload


def _get_secret() -> bytes:
    secret = os.environ.get("RUN_ACCESS_SECRET", "").strip()
    if not secret:
        raise RunAccessError("RUN_ACCESS_SECRET is not configured")
    return secret.encode("utf-8")


def _encode_segment(payload: dict) -> str:
    encoded = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return base64.urlsafe_b64encode(encoded).rstrip(b"=").decode("ascii")


def _decode_segment(segment: str) -> dict:
    padding = "=" * (-len(segment) % 4)
    try:
        decoded = base64.urlsafe_b64decode(f"{segment}{padding}")
        return json.loads(decoded)
    except ValueError as exc:
        raise RunAccessError("malformed run access token payload") from exc


def _sign_segment(segment: str) -> str:
    digest = hmac.new(_get_secret(), segment.encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")