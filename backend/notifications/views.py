from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Q

from notifications.models import Notification, AuditLog
from notifications.serializers import NotificationSerializer, AuditLogSerializer
from notifications.helpers import log_action


def get_employee(request):
    if not request.user or not request.user.is_authenticated:
        return None
    if hasattr(request.user, 'employee'):
        return request.user.employee
    return getattr(request, 'employee', None)


def is_hr_or_admin(user):
    return (
        user
        and user.is_authenticated
        and getattr(user, 'role', '') in ('admin', 'hr')
    )


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Notification endpoints.

    GET  /api/notifications/          list (own + optional ?is_read=false)
    POST /api/notifications/{id}/mark_read/
    POST /api/notifications/mark_all_read/
    """
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        emp = get_employee(self.request)
        if emp is None:
            return Notification.objects.none()

        qs = Notification.objects.filter(recipient=emp)
        is_read = self.request.query_params.get('is_read')
        if is_read is not None:
            qs = qs.filter(is_read=is_read.lower() in ('true', '1', 'yes'))
        return qs

    @action(detail=True, methods=['post'], url_path='mark_read')
    def mark_read(self, request, pk=None):
        notif = self.get_object()
        notif.is_read = True
        notif.save(update_fields=['is_read'])
        return Response({'status': 'marked as read'})

    @action(detail=False, methods=['post'], url_path='mark_all_read')
    def mark_all_read(self, request):
        emp = get_employee(request)
        if emp is None:
            return Response({'error': 'Employee profile required.'}, status=400)
        updated = Notification.objects.filter(recipient=emp, is_read=False).update(is_read=True)
        return Response({'updated': updated})


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    AuditLog - read-only. Admin/HR only.
    Filters: ?module=, ?actor=<employee_id>, ?date_from=YYYY-MM-DD, ?date_to=YYYY-MM-DD
    """
    serializer_class = AuditLogSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if not is_hr_or_admin(self.request.user):
            return AuditLog.objects.none()

        qs = AuditLog.objects.all()
        module = self.request.query_params.get('module')
        actor = self.request.query_params.get('actor')
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')

        if module:
            qs = qs.filter(module=module)
        if actor:
            qs = qs.filter(actor_id=actor)
        if date_from:
            qs = qs.filter(timestamp__date__gte=date_from)
        if date_to:
            qs = qs.filter(timestamp__date__lte=date_to)
        return qs
