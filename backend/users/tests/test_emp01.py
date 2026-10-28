from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from leaves.models import LeaveBalance
from sysadmin.services.seed_rbac import seed_role_permissions
from users.models import Employee
from users.utils import format_employee_id

User = get_user_model()

VALID_PAYLOAD = {
    'name': 'Jane Smith',
    'email': 'jane.smith@vtl.local',
    'roles': ['employee'],
    'department': 'Tech',
    'phone': '9876543210',
}


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
class EmployeeCreateTests(TestCase):
    def setUp(self):
        seed_role_permissions()
        self.client = APIClient()
        self.admin = User.objects.create_user(
            email='admin@vtl.local',
            username='admin',
            password='adminpass123',
            role='admin',
        )
        self.hr = User.objects.create_user(
            email='hr@vtl.local',
            username='hr',
            password='hrpass1234',
            role='hr',
        )
        self.employee_user = User.objects.create_user(
            email='existing@vtl.local',
            username='existing',
            password='existing1',
            role='employee',
        )
        employee = self.employee_user.employee
        employee.name = 'Existing Emp'
        employee.department = 'Tech'
        employee.phone = '9123456789'
        employee.save()

    def _create_as(self, user, payload=None):
        self.client.force_authenticate(user=user)
        return self.client.post('/api/users/employees/create/', payload or VALID_PAYLOAD, format='json')

    def test_create_employee_auto_generates_id_and_leave_balance(self):
        resp = self._create_as(self.hr)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        employee = Employee.objects.get(user__email='jane.smith@vtl.local')
        self.assertEqual(resp.data['employee']['empId'], format_employee_id(employee))
        self.assertTrue(LeaveBalance.objects.filter(employee=employee).exists())
        self.assertIn('temporaryPassword', resp.data)
        self.assertTrue(resp.data['emailSent'])

    def test_welcome_email_sent_on_create(self):
        self._create_as(self.admin)
        self.assertEqual(len(mail.outbox), 1)
        msg = mail.outbox[0]
        self.assertIn('VTL-', msg.subject)
        self.assertIn('jane.smith@vtl.local', msg.to)
        self.assertIn('Temporary password', msg.body)

    def test_mandatory_field_validation(self):
        payload = dict(VALID_PAYLOAD)
        del payload['name']
        resp = self._create_as(self.admin, payload)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

        payload = dict(VALID_PAYLOAD)
        del payload['phone']
        resp = self._create_as(self.admin, payload)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

        payload = dict(VALID_PAYLOAD)
        payload['email'] = 'short.phone@vtl.local'
        payload['phone'] = '123'
        resp = self._create_as(self.admin, payload)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_email_rejected(self):
        payload = dict(VALID_PAYLOAD)
        payload['email'] = 'existing@vtl.local'
        resp = self._create_as(self.admin, payload)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rbac_blocks_employee_without_add_permission(self):
        resp = self._create_as(self.employee_user)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_manager_can_create_employee(self):
        manager = User.objects.create_user(
            email='mgr@vtl.local',
            username='mgr',
            password='mgrpass123',
            role='manager',
        )
        payload = dict(VALID_PAYLOAD)
        payload['email'] = 'newhire@vtl.local'
        resp = self._create_as(manager, payload)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_create_does_not_duplicate_signal_stub(self):
        resp = self._create_as(self.admin)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(email=VALID_PAYLOAD['email'])
        self.assertEqual(Employee.objects.filter(user=user).count(), 1)
        self.assertEqual(user.employee.name, VALID_PAYLOAD['name'])
        self.assertEqual(user.employee.department, VALID_PAYLOAD['department'])

    def test_create_saves_joining_date(self):
        payload = dict(VALID_PAYLOAD)
        payload['email'] = 'june.join@vtl.local'
        payload['joining_date'] = '2026-06-15'
        resp = self._create_as(self.admin, payload)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        employee = Employee.objects.get(user__email='june.join@vtl.local')
        self.assertEqual(str(employee.date_of_joining), '2026-06-15')
        self.assertEqual(resp.data['employee']['joiningDate'], '2026-06-15')

    def test_create_two_employees_back_to_back(self):
        first = dict(VALID_PAYLOAD)
        first['email'] = 'first.hire@vtl.local'
        first['joining_date'] = '2026-05-01'
        second = dict(VALID_PAYLOAD)
        second['email'] = 'second.hire@vtl.local'
        second['name'] = 'Second Hire'
        second['joining_date'] = '2026-06-15'
        resp1 = self._create_as(self.admin, first)
        resp2 = self._create_as(self.admin, second)
        self.assertEqual(resp1.status_code, status.HTTP_201_CREATED, resp1.data)
        self.assertEqual(resp2.status_code, status.HTTP_201_CREATED, resp2.data)
        self.assertEqual(Employee.objects.filter(user__email='first.hire@vtl.local').count(), 1)
        self.assertEqual(Employee.objects.filter(user__email='second.hire@vtl.local').count(), 1)

    def test_update_joining_date(self):
        employee = self.employee_user.employee
        self.client.force_authenticate(user=self.admin)
        resp = self.client.patch(
            f'/api/users/employees/{employee.id}/update/',
            {'joining_date': '2025-08-03'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        employee.refresh_from_db()
        self.assertEqual(str(employee.date_of_joining), '2025-08-03')
        self.assertEqual(resp.data['employee']['joiningDate'], '2025-08-03')
