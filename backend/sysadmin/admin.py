from django.contrib import admin

from sysadmin.models import RoleModulePermission


@admin.register(RoleModulePermission)
class RoleModulePermissionAdmin(admin.ModelAdmin):
    list_display = ('role', 'module', 'can_view', 'can_add', 'can_edit', 'can_delete')
    list_filter = ('role', 'module')
    search_fields = ('role', 'module')
