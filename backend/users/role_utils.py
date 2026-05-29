"""Helpers for primary + additional user roles."""

ROLE_PRIORITY = {
    "admin": 50,
    "hr": 40,
    "manager": 30,
    "sales": 20,
    "employee": 10,
}

VALID_ROLES = set(ROLE_PRIORITY.keys())


def normalize_roles(roles):
    """Return (primary_role, extra_roles) from a list of role strings."""
    if not roles:
        return "employee", []
    cleaned = []
    for r in roles:
        if not isinstance(r, str):
            continue
        key = r.strip().lower()
        if key in VALID_ROLES and key not in cleaned:
            cleaned.append(key)
    if not cleaned:
        return "employee", []
    primary = max(cleaned, key=lambda x: ROLE_PRIORITY.get(x, 0))
    extras = [r for r in cleaned if r != primary]
    return primary, extras


def all_roles(user):
    if not user or not getattr(user, "is_authenticated", True):
        return []
    roles = []
    primary = getattr(user, "role", None)
    if primary and primary not in roles:
        roles.append(primary)
    for r in getattr(user, "extra_roles", None) or []:
        if isinstance(r, str) and r in VALID_ROLES and r not in roles:
            roles.append(r)
    return roles


def user_has_role(user, *roles):
    user_roles = set(all_roles(user))
    return any(r in user_roles for r in roles)


def apply_roles_to_user(user, roles):
    primary, extras = normalize_roles(roles)
    user.role = primary
    user.extra_roles = extras
    return primary
