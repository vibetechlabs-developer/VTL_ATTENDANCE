from django.contrib import admin

from core.models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('timestamp', 'user', 'action', 'app_label', 'model_name', 'object_id', 'object_repr')
    list_filter = ('action', 'app_label', 'model_name')
    search_fields = ('object_id', 'object_repr', 'user__email')
    readonly_fields = (
        'user', 'action', 'app_label', 'model_name', 'object_id',
        'object_repr', 'changes', 'timestamp',
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
