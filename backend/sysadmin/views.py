from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from core.permissions import RoleRequired
from sysadmin.models import RoleModulePermission
from sysadmin.serializers import RoleModulePermissionSerializer, UserPermissionsSerializer
from sysadmin.services.rbac import get_user_module_permissions
from sysadmin.services.seed_rbac import seed_role_permissions


class MyPermissionsView(APIView):
    """Return merged RBAC permissions for the current user."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = {'permissions': get_user_module_permissions(request.user)}
        serializer = UserPermissionsSerializer(data)
        return Response(serializer.data)


class RoleModulePermissionViewSet(ModelViewSet):
    """Admin-only CRUD for the RBAC matrix."""

    queryset = RoleModulePermission.objects.all()
    serializer_class = RoleModulePermissionSerializer
    permission_classes = [IsAuthenticated, RoleRequired]
    allowed_roles = ('admin',)

    def get_queryset(self):
        qs = super().get_queryset()
        role = self.request.query_params.get('role')
        module = self.request.query_params.get('module')
        if role:
            qs = qs.filter(role=role)
        if module:
            qs = qs.filter(module=module)
        return qs


class SeedRBACView(APIView):
    """Re-apply default RBAC matrix (admin only)."""

    permission_classes = [IsAuthenticated, RoleRequired]
    allowed_roles = ('admin',)

    def post(self, request):
        created, updated = seed_role_permissions()
        return Response(
            {'created': created, 'updated': updated},
            status=status.HTTP_200_OK,
        )
