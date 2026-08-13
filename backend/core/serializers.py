from rest_framework import serializers

from core.models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source='user.email', read_only=True, default=None)

    class Meta:
        model = AuditLog
        fields = [
            'id', 'user', 'user_email', 'action', 'app_label', 'model_name',
            'object_id', 'object_repr', 'changes', 'timestamp',
        ]
        read_only_fields = fields
