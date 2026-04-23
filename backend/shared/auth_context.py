class AuthorizationError(PermissionError):
    pass


def get_jwt_claims(event: dict) -> dict:
    request_context = event.get("requestContext", {}) or {}
    authorizer = request_context.get("authorizer", {}) or {}
    jwt_context = authorizer.get("jwt", {}) or {}
    claims = jwt_context.get("claims", {}) or {}

    if not isinstance(claims, dict):
        return {}

    return claims


def require_user_id(event: dict) -> str:
    user_id = str(get_jwt_claims(event).get("sub", "")).strip()
    if not user_id:
        raise AuthorizationError("Missing authenticated user context.")

    return user_id