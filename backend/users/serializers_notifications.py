from rest_framework import serializers

from .models import AppNotification


class AppNotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = AppNotification
        fields = ['id', 'title', 'body', 'type', 'read', 'created_at']
