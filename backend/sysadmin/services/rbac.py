"""RBAC helpers built on User.role + RoleModulePermission (SYS-02)."""

from users.role_utils import all_roles, user_has_role

from sysadmin.models import RoleModulePermission

_ACTION_FIELD = {
    'view': 'can_view',
    'add': 'can_add',
    'edit': 'can_edit',
    'delete': 'can_delete',
}


def user_has_module_permission(user, module, action):
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if user_has_role(user, 'admin'):
        return True
    field = _ACTION_FIELD.get(action)
    if not field:
        return False
    roles = all_roles(user)
    if not roles:
        return False
    return RoleModulePermission.objects.filter(
        role__in=roles,
        module=module,
        **{field: True},
    ).exists()


def get_user_module_permissions(user):
    """Return merged permissions across all roles held by the user."""
    if user_has_role(user, 'admin'):
        return {
            module: {'view': True, 'add': True, 'edit': True, 'delete': True}
            for module, _ in __import__('core.constants', fromlist=['HRMS_MODULES']).HRMS_MODULES
        }
    roles = all_roles(user)
    merged = {}
    for perm in RoleModulePermission.objects.filter(role__in=roles):
        bucket = merged.setdefault(perm.module, {
            'view': False, 'add': False, 'edit': False, 'delete': False,
        })
        for action, field in _ACTION_FIELD.items():
            bucket[action] = bucket[action] or getattr(perm, field)
    return merged
