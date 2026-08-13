"""Default RBAC matrix seeded on deploy (SYS-02)."""

from core.constants import HRMS_MODULES

# role -> module -> {view, add, edit, delete}
DEFAULT_ROLE_PERMISSIONS = {
    'admin': {
        module: {'view': True, 'add': True, 'edit': True, 'delete': True}
        for module, _ in HRMS_MODULES
    },
    'hr': {
        'users': {'view': True, 'add': True, 'edit': True, 'delete': False},
        'attendance': {'view': True, 'add': False, 'edit': True, 'delete': False},
        'leave': {'view': True, 'add': True, 'edit': True, 'delete': False},
        'payroll': {'view': True, 'add': True, 'edit': True, 'delete': False},
        'recruitment': {'view': True, 'add': True, 'edit': True, 'delete': False},
        'performance': {'view': True, 'add': True, 'edit': True, 'delete': False},
        'ess': {'view': True, 'add': False, 'edit': True, 'delete': False},
        'tasks': {'view': True, 'add': True, 'edit': True, 'delete': False},
        'documents': {'view': True, 'add': True, 'edit': True, 'delete': True},
        'training': {'view': True, 'add': True, 'edit': True, 'delete': False},
        'exit_mgmt': {'view': True, 'add': True, 'edit': True, 'delete': False},
        'reports': {'view': True, 'add': True, 'edit': True, 'delete': False},
        'sysadmin': {'view': True, 'add': True, 'edit': True, 'delete': False},
    },
    'manager': {
        'users': {'view': True, 'add': True, 'edit': True, 'delete': False},
        'attendance': {'view': True, 'add': False, 'edit': False, 'delete': False},
        'leave': {'view': True, 'add': False, 'edit': True, 'delete': False},
        'payroll': {'view': False, 'add': False, 'edit': False, 'delete': False},
        'recruitment': {'view': True, 'add': False, 'edit': False, 'delete': False},
        'performance': {'view': True, 'add': True, 'edit': True, 'delete': False},
        'ess': {'view': True, 'add': False, 'edit': False, 'delete': False},
        'tasks': {'view': True, 'add': True, 'edit': True, 'delete': False},
        'documents': {'view': True, 'add': False, 'edit': False, 'delete': False},
        'training': {'view': True, 'add': False, 'edit': False, 'delete': False},
        'exit_mgmt': {'view': True, 'add': False, 'edit': True, 'delete': False},
        'reports': {'view': True, 'add': False, 'edit': False, 'delete': False},
        'sysadmin': {'view': False, 'add': False, 'edit': False, 'delete': False},
    },
    'sales': {
        'users': {'view': True, 'add': False, 'edit': False, 'delete': False},
        'attendance': {'view': True, 'add': True, 'edit': True, 'delete': False},
        'leave': {'view': True, 'add': True, 'edit': False, 'delete': False},
        'ess': {'view': True, 'add': False, 'edit': True, 'delete': False},
        'tasks': {'view': True, 'add': False, 'edit': True, 'delete': False},
        'documents': {'view': True, 'add': False, 'edit': False, 'delete': False},
        'reports': {'view': False, 'add': False, 'edit': False, 'delete': False},
        'sysadmin': {'view': False, 'add': False, 'edit': False, 'delete': False},
    },
    'employee': {
        'users': {'view': True, 'add': False, 'edit': False, 'delete': False},
        'attendance': {'view': True, 'add': True, 'edit': True, 'delete': False},
        'leave': {'view': True, 'add': True, 'edit': False, 'delete': False},
        'ess': {'view': True, 'add': False, 'edit': True, 'delete': False},
        'tasks': {'view': True, 'add': False, 'edit': True, 'delete': False},
        'documents': {'view': True, 'add': False, 'edit': False, 'delete': False},
        'training': {'view': True, 'add': False, 'edit': False, 'delete': False},
        'sysadmin': {'view': False, 'add': False, 'edit': False, 'delete': False},
    },
}


def seed_role_permissions():
    from sysadmin.models import RoleModulePermission

    created = updated = 0
    for role, modules in DEFAULT_ROLE_PERMISSIONS.items():
        for module, perms in modules.items():
            obj, was_created = RoleModulePermission.objects.update_or_create(
                role=role,
                module=module,
                defaults={
                    'can_view': perms.get('view', False),
                    'can_add': perms.get('add', False),
                    'can_edit': perms.get('edit', False),
                    'can_delete': perms.get('delete', False),
                },
            )
            if was_created:
                created += 1
            else:
                updated += 1
    return created, updated
