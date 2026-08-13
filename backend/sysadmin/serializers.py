from rest_framework import serializers

from sysadmin.models import RoleModulePermission


class RoleModulePermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = RoleModulePermission
        fields = [
            'id', 'role', 'module',
            'can_view', 'can_add', 'can_edit', 'can_delete',
        ]


class UserPermissionsSerializer(serializers.Serializer):
    """Merged module permissions for the authenticated user."""

    permissions = serializers.DictField(child=serializers.DictField())
