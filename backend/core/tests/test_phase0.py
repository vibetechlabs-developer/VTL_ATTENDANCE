from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from core.audit import set_audit_user
from core.models import AuditLog
from sysadmin.models import RoleModulePermission
from sysadmin.services.rbac import get_user_module_permissions, user_has_module_permission
from sysadmin.services.seed_rbac import seed_role_permissions
from users.models import Employee

User = get_user_model()


class AuditLogTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email='admin@vtl.local',
            username='admin',
            password='pass',
            role='admin',
        )

    def test_create_logs_audit_entry(self):
        set_audit_user(self.admin)
        user = User.objects.create_user(
            email='new@vtl.local',
            username='newuser',
            password='pass',
            role='employee',
        )
        log = AuditLog.objects.filter(
            action=AuditLog.ACTION_CREATE,
            model_name='user',
            object_id=str(user.pk),
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.user, self.admin)

    def test_update_logs_field_changes(self):
        user = User.objects.create_user(
            email='edit@vtl.local',
            username='edituser',
            password='pass',
            role='employee',
        )
        set_audit_user(self.admin)
        user.role = 'manager'
        user.save()
        log = AuditLog.objects.filter(
            action=AuditLog.ACTION_UPDATE,
            model_name='user',
            object_id=str(user.pk),
        ).first()
        self.assertIsNotNone(log)
        self.assertIn('role', log.changes)

    def test_audit_log_api_requires_hr_or_admin(self):
        hr = User.objects.create_user(
            email='hr@vtl.local',
            username='hr',
            password='pass',
            role='hr',
        )
        emp = User.objects.create_user(
            email='emp@vtl.local',
            username='emp',
            password='pass',
            role='employee',
        )
        client = APIClient()
        client.force_authenticate(user=emp)
        resp = client.get('/api/core/audit-logs/')
        self.assertEqual(resp.status_code, 403)
        client.force_authenticate(user=hr)
        resp = client.get('/api/core/audit-logs/')
        self.assertEqual(resp.status_code, 200)

    def test_audit_log_api_filters_by_model(self):
        hr = User.objects.create_user(
            email='hr2@vtl.local',
            username='hr2',
            password='pass',
            role='hr',
        )
        set_audit_user(hr)
        Employee.objects.create(
            user=User.objects.create_user(
                email='e@vtl.local', username='e', password='p', role='employee',
            ),
            name='Test Emp',
            department='Eng',
        )
        client = APIClient()
        client.force_authenticate(user=hr)
        resp = client.get('/api/core/audit-logs/?model_name=employee')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(len(resp.data) >= 1)


class RBACTests(TestCase):
    def setUp(self):
        seed_role_permissions()
        self.admin = User.objects.create_user(
            email='admin@vtl.local',
            username='admin',
            password='pass',
            role='admin',
        )
        self.hr = User.objects.create_user(
            email='hr@vtl.local',
            username='hr',
            password='pass',
            role='hr',
        )
        self.employee = User.objects.create_user(
            email='emp@vtl.local',
            username='emp',
            password='pass',
            role='employee',
        )

    def test_seed_creates_role_module_permissions(self):
        self.assertTrue(RoleModulePermission.objects.filter(role='hr', module='payroll').exists())
        self.assertTrue(RoleModulePermission.objects.filter(role='employee', module='leave').exists())

    def test_admin_has_all_module_permissions(self):
        perms = get_user_module_permissions(self.admin)
        self.assertTrue(perms['payroll']['edit'])
        self.assertTrue(perms['sysadmin']['delete'])

    def test_employee_cannot_edit_payroll(self):
        self.assertFalse(user_has_module_permission(self.employee, 'payroll', 'view'))
        self.assertFalse(user_has_module_permission(self.employee, 'payroll', 'edit'))

    def test_hr_can_view_and_edit_payroll(self):
        self.assertTrue(user_has_module_permission(self.hr, 'payroll', 'view'))
        self.assertTrue(user_has_module_permission(self.hr, 'payroll', 'edit'))

    def test_my_permissions_endpoint(self):
        client = APIClient()
        client.force_authenticate(user=self.employee)
        resp = client.get('/api/sysadmin/me/permissions/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('permissions', resp.data)
        self.assertTrue(resp.data['permissions']['leave']['add'])

    def test_only_admin_can_list_rbac_matrix(self):
        client = APIClient()
        client.force_authenticate(user=self.hr)
        resp = client.get('/api/sysadmin/permissions/')
        self.assertEqual(resp.status_code, 403)
        client.force_authenticate(user=self.admin)
        resp = client.get('/api/sysadmin/permissions/')
        self.assertEqual(resp.status_code, 200)
