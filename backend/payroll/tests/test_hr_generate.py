from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from sysadmin.services.seed_rbac import seed_role_permissions
from users.models import Employee

User = get_user_model()


class HrPayrollGenerateTests(TestCase):
    def setUp(self):
        seed_role_permissions()
        self.client = APIClient()
        self.hr = User.objects.create_user(
            email='hr.only@vtl.local',
            username='hr_only',
            password='hrpass1234',
            role='hr',
        )
        self.employee_user = User.objects.create_user(
            email='emp.payroll@vtl.local',
            username='emp_payroll',
            password='emppass123',
            role='employee',
        )
        emp = self.employee_user.employee
        emp.name = 'Payroll Emp'
        emp.department = 'Tech'
        emp.salary = '50000'
        emp.save()

        # HR via extra_roles only (primary remains employee)
        self.extra_hr = User.objects.create_user(
            email='extra.hr@vtl.local',
            username='extra_hr',
            password='extrapass1',
            role='employee',
            extra_roles=['hr'],
        )

    def test_hr_only_can_generate_payroll(self):
        self.client.force_authenticate(user=self.hr)
        resp = self.client.post(
            '/api/payroll/payroll-runs/generate/',
            {'month': 10, 'year': 2026},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertGreaterEqual(resp.data.get('payslips_count', 0), 1)

    def test_extra_roles_hr_can_generate_payroll(self):
        self.client.force_authenticate(user=self.extra_hr)
        resp = self.client.post(
            '/api/payroll/payroll-runs/generate/',
            {'month': 11, 'year': 2026},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)

    def test_employee_cannot_generate_payroll(self):
        self.client.force_authenticate(user=self.employee_user)
        resp = self.client.post(
            '/api/payroll/payroll-runs/generate/',
            {'month': 12, 'year': 2026},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_hr_only_can_list_all_payslips(self):
        self.client.force_authenticate(user=self.hr)
        self.client.post(
            '/api/payroll/payroll-runs/generate/',
            {'month': 9, 'year': 2026},
            format='json',
        )
        resp = self.client.get('/api/payroll/payslips/', {'year': 2026})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        rows = resp.data if isinstance(resp.data, list) else resp.data.get('results', [])
        self.assertGreaterEqual(len(rows), 1)
