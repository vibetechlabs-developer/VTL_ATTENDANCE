from rest_framework.permissions import BasePermission, SAFE_METHODS

from users.role_utils import user_has_role


class RoleRequired(BasePermission):
    """Backward-compatible role gate matching existing inline checks."""

    allowed_roles = ()

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if user_has_role(request.user, 'admin'):
            return True
        allowed = getattr(view, 'allowed_roles', None) or self.allowed_roles
        return user_has_role(request.user, *allowed)


class HasModulePermission(BasePermission):
    """
    Granular RBAC (SYS-02). Views set `module` and optionally `required_action`.
    Safe methods default to 'view'; POST→add, PUT/PATCH→edit, DELETE→delete.
    """

    module = None
    required_action = None

    def _resolve_action(self, request):
        if self.required_action:
            return self.required_action
        if request.method in SAFE_METHODS:
            return 'view'
        if request.method == 'POST':
            return 'add'
        if request.method in ('PUT', 'PATCH'):
            return 'edit'
        if request.method == 'DELETE':
            return 'delete'
        return 'view'

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        module = getattr(view, 'module', None) or self.module
        if not module:
            return False
        from sysadmin.services.rbac import user_has_module_permission

        action = self._resolve_action(request)
        return user_has_module_permission(request.user, module, action)
