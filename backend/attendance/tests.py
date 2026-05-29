from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from users.models import Employee, OfficeLocation
from attendance.models import AttendanceLog, BreakLog, CallLog
from attendance.views import validate_office_radius

User = get_user_model()

class GeofencingTests(TestCase):
    def setUp(self):
        # Configure two mock office locations
        self.office_a = OfficeLocation.objects.create(
            name="Ahmedabad HQ",
            latitude=23.0225,
            longitude=72.5714,
            radius_meters=100
        )
        self.office_b = OfficeLocation.objects.create(
            name="GIFT City Branch",
            latitude=23.1610,
            longitude=72.6840,
            radius_meters=200
        )

    def test_within_range_office_a(self):
        # Spot-on or extremely close coordinates to Office A
        is_ok, distance, err = validate_office_radius(23.0226, 72.5715)
        self.assertTrue(is_ok)
        self.assertLess(distance, 100)
        self.assertIsNone(err)

    def test_within_range_office_b(self):
        # Coordinates within 200m of Office B
        is_ok, distance, err = validate_office_radius(23.1612, 72.6842)
        self.assertTrue(is_ok)
        self.assertLess(distance, 200)
        self.assertIsNone(err)

    def test_outside_range_both_offices(self):
        # Coordinates far from both offices (e.g. Mumbai center)
        is_ok, distance, err = validate_office_radius(19.0760, 72.8777)
        self.assertFalse(is_ok)
        self.assertIsNotNone(distance)
        self.assertIn("outside the allowed check-in area", err)


from unittest.mock import patch

class AttendanceAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="employee@vtl.local",
            username="employee",
            password="securePassword123",
            role="employee"
        )
        self.employee = Employee.objects.create(
            user=self.user,
            name="John Doe",
            department="Engineering",
            phone="9876543210",
            is_wfh=True,  # Relax coordinates check using WFH flag for simple api tests
            face_encoding=[0.1] * 128  # Store a valid 128-float encoding
        )
        
        # Configure default office location
        self.office = OfficeLocation.objects.create(
            name="Main Office",
            latitude=23.0225,
            longitude=72.5714,
            radius_meters=500
        )

    @patch("attendance.views.match_face_from_image")
    @patch("attendance.views.decode_base64_image")
    def test_check_in_and_check_out_wfh(self, mock_decode, mock_match):
        mock_decode.return_value = None
        mock_match.return_value = (self.employee, 0.1)
        
        self.client.force_authenticate(user=self.user)
        
        # 1. Verify Check-In
        payload = {
            "latitude": 23.0225,
            "longitude": 72.5714,
            "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" # 1x1 pixel base64 image
        }
        response = self.client.post("/api/attendance/check-in/", payload)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("check_in", response.data)
        self.assertEqual(AttendanceLog.objects.filter(employee=self.employee).count(), 1)
        
        # 2. Verify Session Status
        session_res = self.client.get("/api/attendance/session/")
        self.assertEqual(session_res.status_code, status.HTTP_200_OK)
        self.assertTrue(session_res.data["active"])

        # 3. Verify Check-Out
        checkout_payload = {
            "latitude": 23.0225,
            "longitude": 72.5714,
            "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
        }
        checkout_res = self.client.post("/api/attendance/check-out/", checkout_payload)
        self.assertEqual(checkout_res.status_code, status.HTTP_200_OK)
        self.assertIn("total_hours", checkout_res.data)

        # 4. Verify Session Inactive
        session_res2 = self.client.get("/api/attendance/session/")
        self.assertEqual(session_res2.status_code, status.HTTP_200_OK)
        self.assertFalse(session_res2.data["active"])


class BreakAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="salesrep@vtl.local",
            username="salesrep",
            password="securePassword123",
            role="sales"
        )
        self.employee = Employee.objects.create(
            user=self.user,
            name="Alice Smith",
            department="Sales",
            phone="9876543211",
            is_wfh=True
        )
        # Create an open attendance log for today
        self.log = AttendanceLog.objects.create(
            employee=self.employee,
            check_in=timezone.now() - timezone.timedelta(hours=2),
            check_in_lat=23.0225,
            check_in_lng=72.5714,
            status='present'
        )

    def test_start_and_end_break(self):
        self.client.force_authenticate(user=self.user)
        
        # Start break
        response = self.client.post("/api/attendance/break/start/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(BreakLog.objects.filter(attendance=self.log, break_end__isnull=True).count(), 1)
        
        # End break
        response_end = self.client.post("/api/attendance/break/end/")
        self.assertEqual(response_end.status_code, status.HTTP_200_OK)
        self.assertEqual(BreakLog.objects.filter(attendance=self.log, break_end__isnull=True).count(), 0)

    def test_sales_call_start_and_end(self):
        self.client.force_authenticate(user=self.user)

        # Start active phone call
        response = self.client.post("/api/attendance/call/start/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(CallLog.objects.filter(attendance=self.log, call_end__isnull=True).count(), 1)

        # End phone call
        response_end = self.client.post("/api/attendance/call/end/")
        self.assertEqual(response_end.status_code, status.HTTP_200_OK)
        self.assertEqual(CallLog.objects.filter(attendance=self.log, call_end__isnull=True).count(), 0)
