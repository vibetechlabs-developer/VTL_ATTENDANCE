from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.core.files.base import ContentFile
from django.conf import settings
from geopy.distance import geodesic
import numpy as np
import base64
import uuid

from users.models import Employee, OfficeLocation
from leaves.models import LeaveRequest
from .models import AttendanceLog, BreakLog
from .serializers import CheckInSerializer, CheckOutSerializer, AttendanceLogSerializer
from .face_utils import decode_base64_image, get_face_encoding, match_face


# ─── Helper: Location check ────────────────────────────
def validate_office_radius(user_lat, user_lng):
    office = OfficeLocation.objects.first()
    if not office:
        return False, None, "Office location is not configured. Please contact admin."

    distance = geodesic(
        (user_lat, user_lng),
        (office.latitude, office.longitude)
    ).meters

    # Strict policy: only 500m radius allowed.
    radius = 500
    if distance > radius:
        return (
            False,
            distance,
            f"You are outside office radius. Allowed: {radius}m, your distance: {int(distance)}m."
        )
    return True, distance, None


# ─── Check In ──────────────────────────────────────────
class CheckInView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CheckInSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({'error': 'Invalid data'}, status=400)

        # 1. Location check karo
        lat = serializer.validated_data['latitude']
        lng = serializer.validated_data['longitude']

        in_range, distance_m, location_error = validate_office_radius(lat, lng)
        if not in_range:
            return Response(
                {'error': location_error, 'distance_meters': int(distance_m) if distance_m is not None else None},
                status=400
            )

        # 2. Aaje check-in thai gayo che?
        today = timezone.now().date()
        existing = AttendanceLog.objects.filter(
            employee=request.user.employee,
            date=today
        ).first()

        # TESTING MODE (temporary):
        # allow multiple check-ins in same day only after user has checked out.
        # Revert this block after testing to enforce single check-in/day.
        if existing and existing.check_in and not existing.check_out:
            return Response(
                {'error': 'You have already checked in today.'},
                status=400
            )

        # 3. Face match (strict; compare against logged-in user's registered face)
        image_data = serializer.validated_data['image']
        matched_employee = request.user.employee
        distance = None
        if not request.user.employee.face_encoding:
            return Response(
                {'error': 'Face is not registered for your account. Please contact admin or register face first.'},
                status=400
            )
        try:
            image = decode_base64_image(image_data)
            live_encoding = get_face_encoding(image)
            if live_encoding is None:
                return Response(
                    {'error': 'Face not detected. Keep face centered, improve light, remove mask/covering, and retry.'},
                    status=400
                )

            matched_employee, distance = match_face(live_encoding, [request.user.employee])

            if matched_employee is None:
                threshold = getattr(settings, "FACE_MATCH_THRESHOLD", 0.5)
                return Response(
                    {
                        'error': 'Face does not match your registered profile. Please face camera clearly and retry.',
                        'face_distance': distance,
                        'threshold': threshold,
                    },
                    status=401
                )

        except RuntimeError as err:
            return Response(
                {'error': f'Face verification service unavailable: {str(err)}'},
                status=503
            )

        # 4. Attendance mark karo
        log = AttendanceLog.objects.create(
            employee=matched_employee,
            check_in=timezone.now(),
            check_in_lat=lat,
            check_in_lng=lng,
            status='present'
        )

        return Response({
            'message': 'Check-in successful!',
            'name': matched_employee.name,
            'check_in': log.check_in,
            'confidence': round((1 - distance) * 100, 1) if distance is not None else None,
            'distance_meters': int(distance_m) if distance_m is not None else None,
        })


# ─── Check Out ─────────────────────────────────────────
class CheckOutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CheckOutSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({'error': 'Invalid data'}, status=400)

        lat = serializer.validated_data['latitude']
        lng = serializer.validated_data['longitude']

        in_range, distance_m, location_error = validate_office_radius(lat, lng)
        if not in_range:
            return Response(
                {'error': location_error, 'distance_meters': int(distance_m) if distance_m is not None else None},
                status=400
            )

        today = timezone.now().date()
        log = AttendanceLog.objects.filter(
            employee=request.user.employee,
            date=today,
            check_out=None
        ).first()

        if not log:
            return Response(
                {'error': 'No active check-in record found for today.'},
                status=400
            )

        # Face verify for check-out too (strict; compare against own profile)
        image_data = serializer.validated_data['image']
        if not request.user.employee.face_encoding:
            return Response(
                {'error': 'Face is not registered for your account. Please contact admin or register face first.'},
                status=400
            )
        try:
            image = decode_base64_image(image_data)
            live_encoding = get_face_encoding(image)
            if live_encoding is None:
                return Response(
                    {'error': 'Face not detected. Keep face centered, improve light, remove mask/covering, and retry.'},
                    status=400
                )

            matched_employee, distance = match_face(live_encoding, [request.user.employee])

            if matched_employee is None:
                threshold = getattr(settings, "FACE_MATCH_THRESHOLD", 0.5)
                return Response(
                    {
                        'error': 'Face does not match your registered profile. Please face camera clearly and retry.',
                        'face_distance': distance,
                        'threshold': threshold,
                    },
                    status=401
                )
        except RuntimeError as err:
            return Response(
                {'error': f'Face verification service unavailable: {str(err)}'},
                status=503
            )

        log.check_out = timezone.now()
        log.check_out_lat = lat
        log.check_out_lng = lng

        # Total hours calculate karo
        total_minutes = int((log.check_out - log.check_in).total_seconds() // 60)
        worked_minutes = total_minutes - log.break_minutes
        worked_hours = round(worked_minutes / 60, 2)

        log.total_hours = worked_hours

        # Overtime check
        if worked_hours > 8:
            log.overtime_hours = round(worked_hours - 8, 2)

        log.save()

        return Response({
            'message': 'Check-out successful!',
            'total_hours': log.total_hours,
            'overtime_hours': log.overtime_hours,
            'check_out': log.check_out,
            'distance_meters': int(distance_m) if distance_m is not None else None,
        })


# ─── My Attendance History ─────────────────────────────
class MyAttendanceHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        logs = AttendanceLog.objects.filter(employee=request.user.employee).order_by('-date', '-check_in')
        serializer = AttendanceLogSerializer(logs, many=True)
        return Response(serializer.data)


class MyAttendanceSessionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.now().date()
        log = AttendanceLog.objects.filter(
            employee=request.user.employee,
            date=today
        ).order_by('-check_in').first()

        if not log or not log.check_in:
            return Response({'active': False})

        breaks_qs = BreakLog.objects.filter(attendance=log).order_by('break_start')
        breaks = []
        total_break_minutes = 0
        active_break_start = None
        for b in breaks_qs:
            if b.break_end:
                mins = int((b.break_end - b.break_start).total_seconds() // 60)
                total_break_minutes += mins
                breaks.append({
                    'start': b.break_start.isoformat(),
                    'end': b.break_end.isoformat(),
                    'minutes': mins,
                })
            else:
                active_break_start = b.break_start.isoformat()

        return Response({
            'active': log.check_out is None,
            'checked_in_at': log.check_in.isoformat(),
            'checked_out_at': log.check_out.isoformat() if log.check_out else None,
            'total_work_minutes': int((log.total_hours or 0) * 60),
            'total_break_minutes': total_break_minutes,
            'active_break_start': active_break_start,
            'breaks': breaks,
        })


class AdminAttendanceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in ['admin', 'manager', 'hr']:
            return Response({'error': 'Permission denied.'}, status=403)

        query_date = request.query_params.get('date')
        target_date = timezone.now().date()
        if query_date:
            try:
                target_date = timezone.datetime.fromisoformat(query_date).date()
            except Exception:
                return Response({'error': 'Invalid date format. Use YYYY-MM-DD.'}, status=400)

        logs = AttendanceLog.objects.filter(date=target_date).select_related('employee__user')
        leaves_today = LeaveRequest.objects.filter(
            status='approved',
            start_date__lte=target_date,
            end_date__gte=target_date
        ).select_related('employee__user')

        log_map = {l.employee_id: l for l in logs}
        leave_emp_ids = {l.employee_id for l in leaves_today}
        employees = Employee.objects.select_related('user').all()

        rows = []
        late_cutoff = timezone.datetime.combine(
            target_date,
            timezone.datetime.min.time().replace(hour=10, minute=15)
        )
        if timezone.is_naive(late_cutoff):
            late_cutoff = timezone.make_aware(late_cutoff, timezone.get_current_timezone())

        for emp in employees:
            log = log_map.get(emp.id)
            breaks = BreakLog.objects.filter(attendance=log) if log else []
            break_minutes = 0
            for b in breaks:
                if b.break_end:
                    break_minutes += int((b.break_end - b.break_start).total_seconds() // 60)
            status = 'Absent'
            if emp.id in leave_emp_ids:
                status = 'On Leave'
            elif log and log.check_in:
                status = 'Late' if log.check_in > late_cutoff else 'Present'

            rows.append({
                'id': str(log.id) if log else f'no-log-{emp.id}',
                'employeePk': emp.id,
                'name': emp.name,
                'empId': f"VTL-{str(emp.id).zfill(3)}",
                'department': emp.department,
                'role': emp.user.role,
                'status': status,
                'checkIn': log.check_in.isoformat() if log and log.check_in else None,
                'checkOut': log.check_out.isoformat() if log and log.check_out else None,
                'hours': float(log.total_hours) if log else 0,
                'breakCount': breaks.count() if log else 0,
                'breakMinutes': break_minutes,
            })

        return Response(rows)


class AdminForceCheckOutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role not in ['admin', 'hr']:
            return Response({'error': 'Permission denied.'}, status=403)

        employee_id = request.data.get('employee_id')
        date_str = request.data.get('date')
        if not employee_id:
            return Response({'error': 'employee_id is required.'}, status=400)

        target_date = timezone.now().date()
        if date_str:
            try:
                target_date = timezone.datetime.fromisoformat(str(date_str)).date()
            except Exception:
                return Response({'error': 'Invalid date format. Use YYYY-MM-DD.'}, status=400)

        log = AttendanceLog.objects.filter(
            employee_id=employee_id,
            date=target_date,
            check_in__isnull=False
        ).order_by('-check_in').first()
        if not log:
            return Response({'error': 'No check-in record found for this employee/date.'}, status=404)
        if log.check_out:
            return Response({'error': 'Employee is already checked out.'}, status=400)

        now = timezone.now()
        if log.check_in and now < log.check_in:
            now = log.check_in
        log.check_out = now

        total_minutes = int((log.check_out - log.check_in).total_seconds() // 60)
        worked_minutes = max(0, total_minutes - (log.break_minutes or 0))
        worked_hours = round(worked_minutes / 60, 2)
        log.total_hours = worked_hours
        log.overtime_hours = round(max(0, worked_hours - 8), 2)
        log.save()

        return Response({
            'message': f'Force check-out completed for {log.employee.name}.',
            'employee_name': log.employee.name,
            'check_out': log.check_out,
            'total_hours': log.total_hours,
        })


# ─── Break Start ───────────────────────────────────────
class BreakStartView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        today = timezone.now().date()
        log = AttendanceLog.objects.filter(
            employee=request.user.employee,
            date=today,
            check_out=None
        ).first()

        if not log:
            return Response({'error': 'Please check in first.'}, status=400)

        # Active break already che?
        active_break = BreakLog.objects.filter(
            attendance=log,
            break_end=None
        ).first()

        if active_break:
            return Response({'error': 'A break is already active.'}, status=400)

        break_log = BreakLog.objects.create(
            attendance=log,
            break_start=timezone.now()
        )

        return Response({
            'message': 'Break started.',
            'break_start': break_log.break_start
        })


# ─── Break End ─────────────────────────────────────────
class BreakEndView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        today = timezone.now().date()
        log = AttendanceLog.objects.filter(
            employee=request.user.employee,
            date=today
        ).first()

        if not log:
            return Response({'error': 'Attendance record not found.'}, status=400)

        active_break = BreakLog.objects.filter(
            attendance=log,
            break_end=None
        ).first()

        if not active_break:
            return Response({'error': 'No active break found.'}, status=400)

        active_break.break_end = timezone.now()
        active_break.save()

        # Break minutes update karo
        break_minutes = int(
            (active_break.break_end - active_break.break_start).total_seconds() // 60
        )

        log.break_minutes += break_minutes
        log.save()

        return Response({
            'message': 'Break ended.',
            'break_minutes': break_minutes
        })


# ─── Face Register ─────────────────────────────────────
class FaceRegisterView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        image_data = request.data.get('image')
        if not image_data:
            return Response({'error': 'Image is required.'}, status=400)

        try:
            image = decode_base64_image(image_data)
            encoding = get_face_encoding(image)
        except RuntimeError as err:
            return Response({'error': str(err)}, status=503)

        if encoding is None:
            return Response(
                {'error': 'Face not detected.'},
                status=400
            )

        employee = request.user.employee
        employee.face_encoding = encoding.tolist()
        # Keep latest registered face snapshot for verification support.
        try:
            img_payload = image_data.split(',', 1)[1] if ',' in image_data else image_data
            img_bytes = base64.b64decode(img_payload)
            employee.profile_photo.save(
                f"face_{employee.id}_{uuid.uuid4().hex[:8]}.png",
                ContentFile(img_bytes),
                save=False
            )
        except Exception:
            pass
        employee.save()

        return Response({'message': 'Face registered successfully.'})