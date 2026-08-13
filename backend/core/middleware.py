from core.audit import clear_audit_user, set_audit_user


class AuditUserMiddleware:
    """Attach the authenticated user to thread-local storage for audit signals."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, 'user', None)
        if user is not None and user.is_authenticated:
            set_audit_user(user)
        try:
            return self.get_response(request)
        finally:
            clear_audit_user()
