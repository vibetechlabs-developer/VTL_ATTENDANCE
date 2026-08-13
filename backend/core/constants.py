"""Shared HRMS module identifiers for RBAC and audit logging."""

HRMS_MODULES = [
    ('users', 'Employee Management'),
    ('attendance', 'Attendance'),
    ('leave', 'Leave'),
    ('payroll', 'Payroll'),
    ('recruitment', 'Recruitment'),
    ('performance', 'Performance'),
    ('ess', 'Employee Self-Service'),
    ('tasks', 'Tasks'),
    ('documents', 'Documents'),
    ('training', 'Training'),
    ('exit_mgmt', 'Exit Management'),
    ('reports', 'Reports & Analytics'),
    ('sysadmin', 'System Administration'),
]

HRMS_MODULE_KEYS = {key for key, _ in HRMS_MODULES}

PERMISSION_ACTIONS = ('view', 'add', 'edit', 'delete')
