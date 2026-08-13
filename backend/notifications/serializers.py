from rest_framework import serializers
from notifications.models import Notification, AuditLog


class NotificationSerializer(serializers.ModelSerializer):
    recipient_name = serializers.CharField(source='recipient.name', read_only=True)

    class Meta:
        model = Notification
        fields = [
            'id', 'recipient', 'recipient_name', 'event_type',
            'title', 'body', 'is_read', 'created_on',
            'related_object_type', 'related_object_id',
        ]
        read_only_fields = [
            'id', 'recipient', 'recipient_name', 'created_on',
        ]


class AuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            'id', 'actor', 'actor_name', 'action', 'module',
            'object_repr', 'timestamp', 'ip_address',
        ]
        read_only_fields = fields

    def get_actor_name(self, obj):
        return obj.actor.name if obj.actor else 'System'
