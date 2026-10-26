from rest_framework.response import Response
from rest_framework.views import exception_handler
from rest_framework import status
from django.db import IntegrityError
from django.db.utils import IntegrityError as DbIntegrityError


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is not None:
        return response

    text = str(exc)
    cause = getattr(exc, "__cause__", None)
    if isinstance(exc, (IntegrityError, DbIntegrityError)) or isinstance(cause, (IntegrityError, DbIntegrityError)) or "users_employee_user_id_key" in text:
        return Response(
            {"error": "Could not create employee. Please try again with a different email."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return None
