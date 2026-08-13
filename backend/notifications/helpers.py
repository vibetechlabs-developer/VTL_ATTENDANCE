"""
Reusable helpers that any app can import to create Notifications and AuditLogs.

Usage examples
--------------
from notifications.helpers import notify, log_action

# In leave/views.py after approving a leave:
notify(
    recipient_employee=application.employee,
    event_type='leave_approved',
    title='Your leave was approved',
    body=f'Your {application.leave_type.name} leave from {application.start_date} to {application.end_date} has been approved.',
    related_object={'type': 'LeaveApplication', 'id': application.id},
)
log_action(
    actor=get_employee(request),
    action='approved_leave',
    module='leave',
    object_repr=str(application),
    request=request,
)
"""
import logging

logger = logging.getLogger(__name__)


def notify(recipient_employee, event_type, title, body, related_object=None):
    """
    Create a Notification for recipient_employee.

    Parameters
    ----------
    recipient_employee : Employee instance
    event_type         : str  — free-text event code
    title              : str
    body               : str
    related_object     : dict | None  — {'type': 'ModelName', 'id': pk}
    """
    try:
        from notifications.models import Notification
        Notification.objects.create(
            recipient=recipient_employee,
            event_type=event_type,
            title=title,
            body=body,
            related_object_type=(related_object or {}).get('type', ''),
            related_object_id=(related_object or {}).get('id'),
        )
    except Exception as exc:
        # Never let a notification failure crash a business action
        logger.warning("notify() failed: %s", exc)


def log_action(actor, action, module, object_repr, request=None):
    """
    Create an AuditLog entry.

    Parameters
    ----------
    actor       : Employee instance | None
    action      : str  — e.g. "approved_leave"
    module      : str  — e.g. "leave"
    object_repr : str  — human-readable description of affected object
    request     : DRF/Django Request | None  — used to extract IP address
    """
    try:
        from notifications.models import AuditLog
        ip = None
        if request:
            x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
            if x_forwarded_for:
                ip = x_forwarded_for.split(',')[0].strip()
            else:
                ip = request.META.get('REMOTE_ADDR')
        AuditLog.objects.create(
            actor=actor,
            action=action,
            module=module,
            object_repr=object_repr[:500],
            ip_address=ip,
        )
    except Exception as exc:
        logger.warning("log_action() failed: %s", exc)
