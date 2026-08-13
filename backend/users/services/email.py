import logging

from django.conf import settings
from django.core.mail import send_mail

from users.utils import format_employee_id

logger = logging.getLogger(__name__)


def send_employee_welcome_email(employee, temp_password):
    """
    Send onboarding email with Employee ID and login credentials (EMP-01).
    Returns True when the message was sent, False on failure.
    """
    user = employee.user
    emp_id = format_employee_id(employee)
    subject = f'Welcome to VTL — Your Employee ID is {emp_id}'
    body = (
        f'Hello {employee.name},\n\n'
        f'Your VTL employee account has been created.\n\n'
        f'Employee ID: {emp_id}\n'
        f'Email (login): {user.email}\n'
        f'Temporary password: {temp_password}\n'
        f'Department: {employee.department}\n\n'
        f'Please sign in and change your password after your first login.\n\n'
        f'— VTL HR'
    )
    from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@vtl.local')
    try:
        send_mail(subject, body, from_email, [user.email], fail_silently=False)
        return True
    except Exception:
        logger.exception('Failed to send welcome email to %s', user.email)
        return False
