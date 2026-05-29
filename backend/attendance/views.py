import logging
from datetime import timedelta

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

logger = logging.getLogger(__name__)
from django.utils import timezone
from django.core.files.base import ContentFile
from django.conf import settings
from geopy.distance import geodesic
import numpy as np
import base64
import uuid

from users.models import Employee, OfficeLocation, AppNotification
from leaves.models import LeaveRequest
from .models import AttendanceLog, BreakLog, CallLog
from .serializers import CheckInSerializer, CheckOutSerializer, AttendanceLogSerializer
from .face_utils import (
    decode_base64_image,
    get_face_encoding,
    is_valid_stored_encoding,
    match_face_from_image,
)


# ─── Helper: Location check ────────────────────────────
def validate_office_radius(user_lat, user_lng):
    offices = OfficeLocation.objects.all()
    if not offices.exists():
        return False, None, "Office location is not configured. Please contact admin."

    closest_distance = None
    for office in offices:
        distance = geodesic(
            (user_lat, user_lng),
            (office.latitude, office.longitude)
        ).meters

        # Use office's configured radius, or fallback to standard 500m
        office_radius = getattr(office, "radius_meters", 500) or 500
        if distance <= office_radius:
            return True, distance, None

        if closest_distance is None or distance < closest_distance:
            closest_distance = distance

    return (
        False,
        closest_distance,
        "You are outside the allowed check-in area. Move closer to the office and try again.",
    )


def _face_mismatch_payload(distance):
    threshold = float(getattr(settings, "FACE_MATCH_THRESHOLD", 0.55))
    payload = {
        'error': (
            'Face does not match your registered profile. '
            'Look straight at the camera, use good lighting, and try again. '
            'If this keeps failing, re-register your face from Profile or ask your admin.'
        ),
        'code': 'face_mismatch',
    }
    if settings.DEBUG:
        payload['face_distance'] = distance
        payload['threshold'] = threshold
    return payload


def _verify_face_match(user, image_data):
    """
    Compare live image to the logged-in user's stored face.
    Returns (matched_employee, distance) or raises nothing — returns Response on failure.
    """
    try:
        employee = user.employee
    except Employee.DoesNotExist:
        return Response(
            {
                'error': 'Employee profile not found for this account.',
                'code': 'no_employee',
            },
            status=400,
        )

    employee.refresh_from_db(fields=["face_encoding"])
    if not is_valid_stored_encoding(employee.face_encoding):
        return Response(
            {
                'error': 'Face is not registered for your account. Please contact admin or register face first.',
                'code': 'face_not_registered',
            },
            status=400,
        )

    try:
        image = decode_base64_image(image_data)
    except ValueError as err:
        return Response(
            {'error': str(err), 'code': 'invalid_image'},
            status=400,
        )

    try:
        matched_employee, distance = match_face_from_image(image, [employee])
    except RuntimeError as err:
        msg = (
            str(err)
            if settings.DEBUG
            else 'Face verification is temporarily unavailable. Please try again in a moment.'
        )
        return Response({'error': msg, 'code': 'face_service_unavailable'}, status=503)
    except Exception:
        logger.exception('Unexpected error during face verification')
        msg = (
            'Face verification crashed or failed unexpectedly. Please retry.'
            if settings.DEBUG
            else 'Face verification is temporarily unavailable. Please try again in a moment.'
        )
        return Response({'error': msg, 'code': 'face_service_unavailable'}, status=503)

    if matched_employee is None:
        if distance is None:
            return Response(
                {
                    'error': (
                        'We could not see your face clearly. Use good lighting, '
                        'center your face, and remove masks or coverings if possible.'
                    ),
                    'code': 'face_not_detected',
                },
                status=400,
            )
        return Response(_face_mismatch_payload(distance), status=401)

    if matched_employee.id != employee.id:
        return Response(
            {'error': 'Face verification failed.', 'code': 'face_mismatch'},
            status=401,
        )

    return matched_employee, distance


def _max_break_duration():
    return timedelta(minutes=getattr(settings, "MAX_BREAK_DURATION_MINUTES", 60))


def _auto_resume_expired_breaks(log):
    """End any open break that exceeded MAX_BREAK_DURATION (counts exactly 1 hour)."""
    if not log:
        return False
    now = timezone.now()
    max_duration = _max_break_duration()
    resumed = False
    for b in BreakLog.objects.filter(attendance=log, break_end__isnull=True):
        if (now - b.break_start) < max_duration:
            continue
        b.break_end = b.break_start + max_duration
        b.save(update_fields=["break_end"])
        log.break_minutes = (log.break_minutes or 0) + int(max_duration.total_seconds() // 60)
        log.save(update_fields=["break_minutes"])
        resumed = True
    return resumed


def _live_session_stats(log):
    """Return (live_work_minutes, worked_hours, overtime_hours) for today's log."""
    if not log or not log.check_in:
        return 0, 0.0, 0.0

    _auto_resume_expired_breaks(log)
    log.refresh_from_db(fields=["break_minutes"])

    now = timezone.now()
    break_minutes = log.break_minutes or 0
    max_mins = int(_max_break_duration().total_seconds() // 60)
    for b in BreakLog.objects.filter(attendance=log, break_end__isnull=True):
        elapsed = int((now - b.break_start).total_seconds() // 60)
        break_minutes += min(elapsed, max_mins)

    if log.check_out:
        worked_hours = float(log.total_hours or 0)
        live_work_minutes = int(round(worked_hours * 60))
    else:
        total_minutes = int((now - log.check_in).total_seconds() // 60)
        worked_minutes = max(0, total_minutes - break_minutes)
        live_work_minutes = worked_minutes
        worked_hours = round(worked_minutes / 60, 2)

    overtime_hours = round(max(0, worked_hours - 8), 2)
    return live_work_minutes, worked_hours, overtime_hours


def _notify_overtime_if_needed(user, overtime_hours, worked_hours, title_suffix=''):
    if overtime_hours <= 0:
        return
    today = timezone.now().date()
    title = f'Overtime{title_suffix}'
    if AppNotification.objects.filter(
        user=user,
        title=title,
        created_at__date=today,
    ).exists():
        return
    AppNotification.objects.create(
        user=user,
        title=title,
        body=(
            f'You have worked {worked_hours:.1f} hours today. '
            f'Overtime: {overtime_hours:.1f} hour(s) beyond the 8-hour shift.'
        ),
        type='warning',
    )


def _end_active_call(log):
    active_call = CallLog.objects.filter(attendance=log, call_end__isnull=True).first()
    if not active_call:
        return
    active_call.call_end = timezone.now()
    active_call.save(update_fields=["call_end"])


def _call_stats_for_log(log, now=None):
    if not log:
        return 0, 0, None
    now = now or timezone.now()
    calls = CallLog.objects.filter(attendance=log).order_by("call_start")
    total_minutes = 0
    active_call_start = None
    for c in calls:
        if c.call_end:
            total_minutes += int((c.call_end - c.call_start).total_seconds() // 60)
        else:
            active_call_start = c.call_start
            total_minutes += int((now - c.call_start).total_seconds() // 60)
    return total_minutes, calls.count(), active_call_start


def _close_open_attendance_session(log, lat, lng):
    """Set check-out and hours on an open log; end any active breaks."""
    _end_active_call(log)
    _auto_resume_expired_breaks(log)
    log.refresh_from_db(fields=["break_minutes"])
    now = timezone.now()
    max_duration = _max_break_duration()
    for b in BreakLog.objects.filter(attendance=log, break_end__isnull=True):
        elapsed = now - b.break_start
        b.break_end = b.break_start + max_duration if elapsed >= max_duration else now
        b.save(update_fields=["break_end"])
        log.break_minutes += int((b.break_end - b.break_start).total_seconds() // 60)

    log.check_out = now
    log.check_out_lat = lat
    log.check_out_lng = lng
    total_minutes = int((log.check_out - log.check_in).total_seconds() // 60)
    worked_minutes = max(0, total_minutes - (log.break_minutes or 0))
    log.total_hours = round(worked_minutes / 60, 2)
    log.overtime_hours = round(max(0, log.total_hours - 8), 2) if log.total_hours > 8 else 0
    log.save()


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

        relaxed = getattr(settings, "ATTENDANCE_RELAXED_VERIFY", False)

        is_wfh = bool(getattr(request.user.employee, "is_wfh", False))
        in_range, distance_m, location_error = validate_office_radius(lat, lng)
        if (not relaxed) and (not is_wfh) and (not in_range):
            return Response(
                {'error': location_error, 'distance_meters': int(distance_m) if distance_m is not None else None},
                status=400
            )

        # 2. Aaje active check-in che? (open session = check_in set, check_out empty)
        today = timezone.now().date()
        active_open = (
            AttendanceLog.objects.filter(
                employee=request.user.employee,
                date=today,
                check_in__isnull=False,
                check_out__isnull=True,
            )
            .order_by('-check_in')
            .first()
        )

        if active_open and relaxed:
            # Testing: close previous open session so another check-in / check-out cycle works.
            _close_open_attendance_session(active_open, lat, lng)
        elif active_open and not relaxed:
            return Response(
                {'error': 'You have already checked in today.'},
                status=400
            )

        # 3. Face match (strict; compare against logged-in user's registered face)
        image_data = serializer.validated_data['image']
        matched_employee = request.user.employee
        distance = None
        if not relaxed:
            face_result = _verify_face_match(request.user, image_data)
            if isinstance(face_result, Response):
                return face_result
            matched_employee, distance = face_result

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
        allow_outside_meeting = serializer.validated_data.get('allow_outside_meeting', False)
        outside_note = (serializer.validated_data.get('outside_note') or "").strip()

        relaxed = getattr(settings, "ATTENDANCE_RELAXED_VERIFY", False)

        is_wfh = bool(getattr(request.user.employee, "is_wfh", False))
        in_range, distance_m, location_error = validate_office_radius(lat, lng)
        # Default policy: office radius mandatory. Exception: outside client meeting with note.
        if (not relaxed) and (not is_wfh) and (not allow_outside_meeting) and (not in_range):
            return Response(
                {'error': location_error, 'distance_meters': int(distance_m) if distance_m is not None else None},
                status=400
            )
        if allow_outside_meeting and not outside_note:
            return Response(
                {'error': 'Please add a client meeting note for outside checkout.'},
                status=400
            )

        today = timezone.now().date()
        log = (
            AttendanceLog.objects.filter(
                employee=request.user.employee,
                date=today,
                check_out__isnull=True,
                check_in__isnull=False,
            )
            .order_by('-check_in')
            .first()
        )

        if not log:
            return Response(
                {'error': 'No active check-in record found for today.'},
                status=400
            )

        # Face verify for check-out too (strict; compare against own profile)
        image_data = serializer.validated_data['image']
        matched_employee = log.employee
        distance = None
        if not relaxed:
            face_result = _verify_face_match(request.user, image_data)
            if isinstance(face_result, Response):
                return face_result
            matched_employee, distance = face_result

        _end_active_call(log)
        _auto_resume_expired_breaks(log)
        log.refresh_from_db(fields=["break_minutes"])

        log.check_out = timezone.now()
        log.check_out_lat = lat
        log.check_out_lng = lng

        # Total hours calculate karo
        total_minutes = int((log.check_out - log.check_in).total_seconds() // 60)
        worked_minutes = total_minutes - log.break_minutes
        worked_hours = round(worked_minutes / 60, 2)

        log.total_hours = worked_hours

        log.overtime_hours = round(max(0, worked_hours - 8), 2)
        log.checkout_mode = "outside_client" if allow_outside_meeting else "office"
        log.checkout_note = outside_note if allow_outside_meeting else ""

        log.save()
        _notify_overtime_if_needed(
            request.user,
            log.overtime_hours,
            log.total_hours,
            title_suffix=' recorded',
        )

        return Response({
            'message': 'Check-out successful!',
            'total_hours': log.total_hours,
            'overtime_hours': log.overtime_hours,
            'check_out': log.check_out,
            'distance_meters': int(distance_m) if distance_m is not None else None,
            'checkout_mode': log.checkout_mode,
            'checkout_note': log.checkout_note,
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

        auto_resumed = _auto_resume_expired_breaks(log)
        if auto_resumed:
            log.refresh_from_db(fields=["break_minutes"])

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

        live_work_minutes, worked_hours, overtime_hours = _live_session_stats(log)
        call_minutes, call_count, active_call_start = _call_stats_for_log(log)

        return Response({
            'active': log.check_out is None,
            'checked_in_at': log.check_in.isoformat(),
            'checked_out_at': log.check_out.isoformat() if log.check_out else None,
            'total_work_minutes': live_work_minutes,
            'worked_hours': worked_hours,
            'overtime_hours': overtime_hours,
            'total_break_minutes': total_break_minutes,
            'active_break_start': active_break_start,
            'breaks': breaks,
            'break_auto_resumed': auto_resumed,
            'max_break_minutes': int(_max_break_duration().total_seconds() // 60),
            'call_minutes': call_minutes,
            'call_count': call_count,
            'active_call_start': active_call_start.isoformat() if active_call_start else None,
            'on_call': active_call_start is not None,
        })


class OvertimeNotifyView(APIView):
    """Create a one-per-day overtime notification when the employee crosses 8 hours."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            employee = request.user.employee
        except Employee.DoesNotExist:
            return Response({'error': 'Employee profile not found.'}, status=404)

        today = timezone.now().date()
        log = AttendanceLog.objects.filter(employee=employee, date=today).order_by('-check_in').first()
        if not log or not log.check_in:
            return Response({'notified': False})

        _, worked_hours, overtime_hours = _live_session_stats(log)
        if overtime_hours <= 0:
            return Response({'notified': False})

        _notify_overtime_if_needed(request.user, overtime_hours, worked_hours)
        return Response({'notified': True, 'overtime_hours': overtime_hours})


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
        if request.user.role == 'manager':
            # Manager can only see employees who report to them
            employees = employees.filter(managers=request.user).distinct()

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
            call_minutes, call_count, active_call_start = _call_stats_for_log(log) if log else (0, 0, None)
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
                'overtimeHours': float(log.overtime_hours) if log else 0,
                'breakCount': breaks.count() if log else 0,
                'breakMinutes': break_minutes,
                'callMinutes': call_minutes,
                'callCount': call_count,
                'onCallNow': active_call_start is not None,
                'checkoutMode': log.checkout_mode if log else "office",
                'checkoutNote': log.checkout_note if log else "",
            })

        return Response(rows)


class AdminAttendanceOverviewView(APIView):
    """Present vs absent counts per day for the last N days (admin dashboard chart)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in ['admin', 'manager', 'hr']:
            return Response({'error': 'Permission denied.'}, status=403)

        try:
            days = int(request.query_params.get('days', 7))
        except (TypeError, ValueError):
            days = 7
        days = max(1, min(days, 31))

        today = timezone.now().date()
        employees = Employee.objects.all()
        if request.user.role == 'manager':
            employees = employees.filter(managers=request.user).distinct()
        employee_ids = list(employees.values_list('id', flat=True))
        total_staff = len(employee_ids)

        rows = []
        for offset in range(days - 1, -1, -1):
            target_date = today - timedelta(days=offset)
            logs = AttendanceLog.objects.filter(
                date=target_date,
                employee_id__in=employee_ids,
            )
            log_map = {l.employee_id: l for l in logs}
            leave_emp_ids = set(
                LeaveRequest.objects.filter(
                    status='approved',
                    start_date__lte=target_date,
                    end_date__gte=target_date,
                    employee_id__in=employee_ids,
                ).values_list('employee_id', flat=True)
            )

            present = 0
            absent = 0
            for emp_id in employee_ids:
                if emp_id in leave_emp_ids:
                    continue
                log = log_map.get(emp_id)
                if log and log.check_in:
                    present += 1
                else:
                    absent += 1

            rows.append({
                'day': target_date.strftime('%a'),
                'date': target_date.isoformat(),
                'present': present,
                'absent': absent,
            })

        return Response({
            'days': rows,
            'totalStaff': total_staff,
        })


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

        _end_active_call(log)
        _auto_resume_expired_breaks(log)
        log.refresh_from_db(fields=["break_minutes"])

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


# ─── Admin: Employee Attendance History (range) ───────────────
class AdminEmployeeAttendanceHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in ['admin', 'hr', 'manager']:
            return Response({'error': 'Permission denied.'}, status=403)

        employee_id = request.query_params.get('employee_id')
        from_str = request.query_params.get('from')
        to_str = request.query_params.get('to')
        if not employee_id or not from_str or not to_str:
            return Response({'error': 'employee_id, from, and to are required.'}, status=400)

        try:
            start_date = timezone.datetime.fromisoformat(str(from_str)).date()
            end_date = timezone.datetime.fromisoformat(str(to_str)).date()
        except Exception:
            return Response({'error': 'Invalid date format. Use YYYY-MM-DD.'}, status=400)

        if start_date > end_date:
            start_date, end_date = end_date, start_date

        if request.user.role == 'manager':
            # Manager can only query history of employees assigned to them.
            emp_obj = Employee.objects.filter(id=employee_id).prefetch_related('managers').first()
            if not emp_obj or not emp_obj.managers.filter(id=request.user.id).exists():
                return Response({'error': 'Permission denied.'}, status=403)

        logs = (
            AttendanceLog.objects
            .filter(employee_id=employee_id, date__gte=start_date, date__lte=end_date)
            .select_related('employee__user')
            .order_by('-date')
        )

        current_tz = timezone.get_current_timezone()
        rows = []
        for log in logs:
            late_cutoff = timezone.make_aware(
                timezone.datetime.combine(log.date, timezone.datetime.min.time().replace(hour=10, minute=15)),
                current_tz
            )
            day_status = 'Absent'
            if log.check_in:
                day_status = 'Late' if log.check_in > late_cutoff else 'Present'

            call_minutes, call_count, active_call_start = _call_stats_for_log(log)
            call_sessions = []
            for c in CallLog.objects.filter(attendance=log).order_by("call_start"):
                call_sessions.append({
                    "start": c.call_start.isoformat(),
                    "end": c.call_end.isoformat() if c.call_end else None,
                })
            rows.append({
                'id': str(log.id),
                'date': log.date.isoformat(),
                'name': log.employee.name,
                'empId': f"VTL-{str(log.employee_id).zfill(3)}",
                'department': log.employee.department,
                'role': log.employee.user.role,
                'status': day_status,
                'checkIn': log.check_in.isoformat() if log.check_in else None,
                'checkOut': log.check_out.isoformat() if log.check_out else None,
                'breakMinutes': int(log.break_minutes or 0),
                'callMinutes': call_minutes,
                'callCount': call_count,
                'onCallNow': active_call_start is not None,
                'callSessions': call_sessions,
                'hours': float(log.total_hours or 0),
                'overtimeHours': float(log.overtime_hours or 0),
                'checkoutMode': log.checkout_mode,
                'checkoutNote': log.checkout_note,
            })

        return Response(rows)


# ─── Break Start ───────────────────────────────────────
class BreakStartView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        today = timezone.now().date()
        log = (
            AttendanceLog.objects.filter(
                employee=request.user.employee,
                date=today,
                check_out__isnull=True,
                check_in__isnull=False,
            )
            .order_by('-check_in')
            .first()
        )

        if not log:
            return Response({'error': 'Please check in first.'}, status=400)

        _auto_resume_expired_breaks(log)

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
        log = (
            AttendanceLog.objects.filter(
                employee=request.user.employee,
                date=today,
                check_out__isnull=True,
                check_in__isnull=False,
            )
            .order_by('-check_in')
            .first()
        )

        if not log:
            return Response({'error': 'Attendance record not found.'}, status=400)

        auto_resumed = _auto_resume_expired_breaks(log)
        if auto_resumed:
            log.refresh_from_db(fields=["break_minutes"])

        active_break = BreakLog.objects.filter(
            attendance=log,
            break_end=None
        ).first()

        if not active_break:
            return Response({
                'message': 'Break already ended.',
                'auto_resumed': auto_resumed,
            })

        active_break.break_end = timezone.now()
        active_break.save()

        break_minutes = int(
            (active_break.break_end - active_break.break_start).total_seconds() // 60
        )

        log.break_minutes += break_minutes
        log.save(update_fields=['break_minutes'])

        return Response({
            'message': 'Break ended.',
            'break_minutes': break_minutes,
            'auto_resumed': False,
        })


# ─── Sales: On a call (idle auto-break pause) ───────────
class CallStartView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from users.role_utils import user_has_role

        if not user_has_role(request.user, "sales"):
            return Response({"error": "On-call mode is only for sales team."}, status=403)

        today = timezone.now().date()
        log = (
            AttendanceLog.objects.filter(
                employee=request.user.employee,
                date=today,
                check_out__isnull=True,
                check_in__isnull=False,
            )
            .order_by("-check_in")
            .first()
        )
        if not log:
            return Response({"error": "Please check in first."}, status=400)

        active_call = CallLog.objects.filter(attendance=log, call_end__isnull=True).first()
        if active_call:
            return Response({
                "message": "Already on a call.",
                "call_start": active_call.call_start,
            })

        call_log = CallLog.objects.create(attendance=log, call_start=timezone.now())
        return Response({
            "message": "On-call mode started.",
            "call_start": call_log.call_start,
        })


class CallEndView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from users.role_utils import user_has_role

        if not user_has_role(request.user, "sales"):
            return Response({"error": "On-call mode is only for sales team."}, status=403)

        today = timezone.now().date()
        log = (
            AttendanceLog.objects.filter(
                employee=request.user.employee,
                date=today,
                check_out__isnull=True,
                check_in__isnull=False,
            )
            .order_by("-check_in")
            .first()
        )
        if not log:
            return Response({"error": "Attendance record not found."}, status=400)

        active_call = CallLog.objects.filter(attendance=log, call_end__isnull=True).first()
        if not active_call:
            return Response({"message": "No active call session."})

        active_call.call_end = timezone.now()
        active_call.save(update_fields=["call_end"])
        call_minutes = int((active_call.call_end - active_call.call_start).total_seconds() // 60)
        return Response({
            "message": "On-call mode ended.",
            "call_minutes": call_minutes,
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