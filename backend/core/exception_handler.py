from rest_framework.response import Response
from rest_framework.views import exception_handler
from rest_framework import status
from django.db import IntegrityError
from django.db.utils import IntegrityError as DbIntegrityError


def _is_duplicate_employee(exc):
    seen = []
    current = exc
    while current is not None and current not in seen:
        seen.append(current)
        if isinstance(current, (IntegrityError, DbIntegrityError)):
            return True
        text = str(current)
        if "users_employee_user_id_key" in text or "duplicate key" in text.lower():
            return True
        current = getattr(current, "__cause__", None) or getattr(current, "__context__", None)
    return False


def api_exception_handler(exc, context):
    if _is_duplicate_employee(exc):
        return Response(
            {"error": "Could not create employee. Please try again."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return exception_handler(exc, context)
