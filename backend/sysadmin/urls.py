from django.urls import include, path
from rest_framework.routers import DefaultRouter

from sysadmin.views import MyPermissionsView, RoleModulePermissionViewSet, SeedRBACView

router = DefaultRouter()
router.register(r'permissions', RoleModulePermissionViewSet, basename='role-module-permission')

urlpatterns = [
    path('me/permissions/', MyPermissionsView.as_view(), name='my-permissions'),
    path('rbac/seed/', SeedRBACView.as_view(), name='rbac-seed'),
    path('', include(router.urls)),
]
