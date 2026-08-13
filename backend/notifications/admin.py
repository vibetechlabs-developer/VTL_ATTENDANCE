from django.contrib import admin
from notifications.models import Notification, AuditLog


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ['recipient', 'event_type', 'title', 'is_read', 'created_on']
    list_filter = ['event_type', 'is_read']
    search_fields = ['recipient__name', 'title', 'event_type']
    readonly_fields = ['created_on']
    ordering = ['-created_on']


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ['timestamp', 'actor', 'action', 'module', 'object_repr', 'ip_address']
    list_filter = ['module']
    search_fields = ['actor__name', 'action', 'object_repr']
    readonly_fields = ['timestamp', 'actor', 'action', 'module', 'object_repr', 'ip_address']
    ordering = ['-timestamp']

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
