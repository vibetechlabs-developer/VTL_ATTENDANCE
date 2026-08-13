from django.db.models import Q
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated

from core.models import AuditLog
from core.permissions import HasModulePermission, RoleRequired
from core.serializers import AuditLogSerializer


class AuditLogListView(ListAPIView):
    """Read-only, filterable audit trail (SYS-03). HR/Admin only."""

    serializer_class = AuditLogSerializer
    permission_classes = [IsAuthenticated, RoleRequired]
    allowed_roles = ('hr',)

    def get_queryset(self):
        qs = AuditLog.objects.select_related('user').all()
        params = self.request.query_params
        if app_label := params.get('app_label'):
            qs = qs.filter(app_label=app_label)
        if model_name := params.get('model_name'):
            qs = qs.filter(model_name=model_name)
        if object_id := params.get('object_id'):
            qs = qs.filter(object_id=object_id)
        if action := params.get('action'):
            qs = qs.filter(action=action)
        if user_id := params.get('user_id'):
            qs = qs.filter(user_id=user_id)
        if search := params.get('q'):
            qs = qs.filter(
                Q(object_repr__icontains=search) | Q(object_id=search)
            )
        return qs
