from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from django.contrib.auth import authenticate
from django.conf import settings
from django.utils import timezone
from django.core.files.base import ContentFile
import base64
import uuid
import threading

from .role_utils import all_roles
from .serializers import (
    LoginSerializer,
    EmployeeListSerializer,
    EmployeeCreateSerializer,
    EmployeeUpdateSerializer,
    _format_reports_to,
    _manager_employee_ids,
)
from .models import Employee, PushSubscription, User, Appraisal, AppNotification
from attendance.face_utils import decode_base64_image, get_face_encoding, is_valid_stored_encoding
from attendance.models import AttendanceLog
from leaves.models import LeaveRequest
from updates.models import DailyUpdate
from .push_utils import send_push_message
from .serializers_notifications import AppNotificationSerializer
import mimetypes


def _first_serializer_error(errors):
    if isinstance(errors, dict):
        for _, value in errors.items():
            msg = _first_serializer_error(value)
            if msg:
                return msg
    elif isinstance(errors, list) and errors:
        return _first_serializer_error(errors[0])
    elif isinstance(errors, str):
        return errors
    return None

class LoginView(APIView):
    permission_classes = []  

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(
                {'error': 'Email and Password required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        email = serializer.validated_data['email']
        password = serializer.validated_data['password']

        user = authenticate(request, username=email, password=password)

        if user is None:
            return Response(
                {'error': 'Invalid email or password'},
                status=status.HTTP_401_UNAUTHORIZED
            )

       
        refresh = RefreshToken.for_user(user)

        
        name = user.email
        if hasattr(user, 'employee'):
            name = user.employee.name

        previous_login = user.last_login
        login_notice = None
        if previous_login:
            diff_minutes = (timezone.now() - previous_login).total_seconds() / 60
            if diff_minutes <= 30:
                login_notice = "Another login was detected in the last 30 minutes."
        user.last_login = timezone.now()
        user.save(update_fields=['last_login'])

        roles = all_roles(user)
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'role': user.role,
            'roles': roles,
            'email': user.email,
            'name': name,
            'notice': login_notice,
        })


class TokenRefreshView(APIView):
    permission_classes = []

    def post(self, request):
        serializer = TokenRefreshSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({'error': 'Invalid or expired refresh token'}, status=status.HTTP_401_UNAUTHORIZED)
        return Response(serializer.validated_data)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            token = RefreshToken(refresh_token)
            token.blacklist() 
            return Response({'message': 'Logout successful'})
        except Exception:
            return Response(
                {'error': 'Invalid token'},
                status=status.HTTP_400_BAD_REQUEST
            )


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        emp = getattr(user, 'employee', None)
        name = user.email
        if emp:
            name = emp.name

        avatar = None
        if emp and emp.profile_photo:
            avatar = request.build_absolute_uri(emp.profile_photo.url)
        
        return Response({
            'id': str(user.pk),
            'email': user.email,
            'role': user.role,
            'roles': all_roles(user),
            'name': name,
            'department': emp.department if emp else '',
            'phone': (emp.phone or '') if emp else '',
            'empId': f'VTL-{str(emp.pk).zfill(3)}' if emp else f'VTL-{str(user.pk).zfill(3)}',
            'bio': '',
            'location': '',
            'avatar': avatar,
            'isWfh': bool(emp.is_wfh) if emp else False,
        })


class EmployeesListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        users = User.objects.select_related('employee').prefetch_related(
            'employee__managers__employee'
        ).order_by('-id')
        rows = []
        for user in users:
            employee = getattr(user, 'employee', None)
            profile_name = ''
            if employee and employee.name:
                profile_name = employee.name.strip()
            fallback_name = (
                profile_name
                or user.get_full_name().strip()
                or (user.username or '').strip()
                or user.email.split('@')[0]
            )
            if employee and employee.profile_photo:
                avatar = request.build_absolute_uri(employee.profile_photo.url)
            else:
                avatar = None
            rows.append({
                'id': str(employee.id) if employee else f'user-{user.id}',
                'userId': str(user.id),
                'name': fallback_name,
                'email': user.email,
                'empId': f'VTL-{str(employee.id if employee else user.id).zfill(3)}',
                'role': user.role,
                'department': employee.department if employee else ('Administration' if user.role == 'admin' else 'General'),
                'managerUserId': str(employee.manager_id) if employee and employee.manager_id else None,
                'managerEmployeeId': (
                    str(_manager_employee_ids(employee)[0])
                    if employee and _manager_employee_ids(employee)
                    else None
                ),
                'managerEmployeeIds': [str(i) for i in _manager_employee_ids(employee)] if employee else [],
                'reportsTo': _format_reports_to(employee) if employee else '—',
                'joiningDate': (
                    employee.created_at.strftime('%Y-%m-%d')
                    if employee and employee.created_at
                    else user.date_joined.strftime('%Y-%m-%d')
                ),
                'faceStatus': 'registered' if employee and is_valid_stored_encoding(employee.face_encoding) else 'pending',
                'avatar': avatar,
                'status': 'active' if user.is_active else 'inactive',
                'hasEmployeeProfile': bool(employee),
                'isWfh': bool(employee.is_wfh) if employee else False,
            })
        return Response(rows)


class EmployeesCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role not in ['admin', 'manager']:
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        serializer = EmployeeCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {'error': _first_serializer_error(serializer.errors) or 'Invalid employee details.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        employee, temp_password = serializer.save()

        row = EmployeeListSerializer(employee, context={'request': request}).data
        return Response(
            {
                'employee': row,
                'temporaryPassword': temp_password,
            },
            status=status.HTTP_201_CREATED
        )


class EmployeesUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if request.user.role not in ['admin', 'manager']:
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        employee = Employee.objects.select_related('user').filter(pk=pk).first()
        if not employee:
            return Response({'error': 'Employee not found'}, status=status.HTTP_404_NOT_FOUND)

        serializer = EmployeeUpdateSerializer(data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(
                {'error': _first_serializer_error(serializer.errors) or 'Invalid employee details.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        serializer.update(employee, serializer.validated_data)
        row = EmployeeListSerializer(employee, context={'request': request}).data
        return Response({'employee': row})


class EmployeesDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        if request.user.role not in ['admin', 'manager']:
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        employee = Employee.objects.select_related('user').filter(pk=pk).first()
        if not employee:
            return Response({'error': 'Employee not found'}, status=status.HTTP_404_NOT_FOUND)

        if employee.user_id == request.user.id:
            return Response({'error': 'You cannot delete your own account.'}, status=status.HTTP_400_BAD_REQUEST)

        user = employee.user
        employee.delete()
        user.delete()
        return Response({'message': 'Employee deleted successfully.'})


class MeUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        user = request.user
        emp = getattr(user, 'employee', None)

        name = request.data.get('name')
        email = request.data.get('email')
        phone = request.data.get('phone')
        department = request.data.get('department')
        password = request.data.get('password')

        if email is not None:
            email = str(email).strip().lower()
            if not email:
                return Response({'error': 'Email is required.'}, status=status.HTTP_400_BAD_REQUEST)
            if User.objects.exclude(pk=user.pk).filter(email=email).exists():
                return Response({'error': 'This email is already in use.'}, status=status.HTTP_400_BAD_REQUEST)
            user.email = email

        if password is not None:
            password = str(password).strip()
            if password:
                if len(password) < 8:
                    return Response({'error': 'Password must be at least 8 characters.'}, status=status.HTTP_400_BAD_REQUEST)
                user.set_password(password)

        user.save()

        if emp:
            if name is not None:
                emp.name = str(name).strip() or emp.name
            if phone is not None:
                emp.phone = str(phone).strip()
            if department is not None:
                emp.department = str(department).strip() or emp.department
            emp.save()

        return MeView().get(request)


class EmployeeFaceRegisterByAdminView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if request.user.role not in ['admin', 'manager']:
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        employee = Employee.objects.select_related('user').filter(pk=pk).first()
        if not employee:
            return Response({'error': 'Employee not found'}, status=status.HTTP_404_NOT_FOUND)

        image_data = request.data.get('image')
        if not image_data:
            return Response({'error': 'Image is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            image = decode_base64_image(image_data)
            encoding = get_face_encoding(image)
        except RuntimeError as err:
            return Response({'error': str(err)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception:
            return Response({'error': 'Invalid image payload'}, status=status.HTTP_400_BAD_REQUEST)

        if encoding is None:
            return Response({'error': 'Face not detected'}, status=status.HTTP_400_BAD_REQUEST)

        employee.face_encoding = encoding.tolist()
        # Save latest registered face snapshot for admin review/debugging.
        try:
            img_payload = image_data.split(',', 1)[1] if ',' in image_data else image_data
            img_bytes = base64.b64decode(img_payload)
            if img_bytes:
                employee.profile_photo.save(
                    f"face_{employee.id}_{uuid.uuid4().hex[:8]}.png",
                    ContentFile(img_bytes),
                )
        except Exception:
            # Keep registration successful even if photo save fails.
            pass
        employee.save()
        row = EmployeeListSerializer(employee, context={'request': request}).data
        return Response({'employee': row, 'message': 'Face registered successfully'})


class EmployeeFaceDataView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        if request.user.role not in ['admin', 'manager']:
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        employee = Employee.objects.select_related('user').filter(pk=pk).first()
        if not employee:
            return Response({'error': 'Employee not found'}, status=status.HTTP_404_NOT_FOUND)

        encoding = employee.face_encoding or []
        preview = []
        if isinstance(encoding, list):
            preview = encoding[:12]

        profile_photo_data_url = None
        try:
            if employee.profile_photo:
                photo_path = employee.profile_photo.path
                with open(photo_path, "rb") as f:
                    photo_bytes = f.read()
                mime, _ = mimetypes.guess_type(photo_path)
                if not mime:
                    mime = "image/png"
                profile_photo_data_url = f"data:{mime};base64,{base64.b64encode(photo_bytes).decode('utf-8')}"
        except Exception:
            profile_photo_data_url = None

        return Response({
            'employee_id': employee.id,
            'employee_name': employee.name,
            'has_face': is_valid_stored_encoding(employee.face_encoding),
            'profile_photo': request.build_absolute_uri(employee.profile_photo.url) if employee.profile_photo else None,
            'profile_photo_data_url': profile_photo_data_url,
            'vector_length': len(encoding) if isinstance(encoding, list) else 0,
            'vector_preview': preview,
        })


class AuditLogsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in ['admin', 'hr']:
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        query = (request.query_params.get('q') or '').strip().lower()
        category = (request.query_params.get('type') or 'all').strip().lower()
        from_date = request.query_params.get('from')
        to_date = request.query_params.get('to')

        def in_range(dt):
            d = timezone.localtime(dt).date()
            if from_date:
                try:
                    if d < timezone.datetime.fromisoformat(from_date).date():
                        return False
                except Exception:
                    pass
            if to_date:
                try:
                    if d > timezone.datetime.fromisoformat(to_date).date():
                        return False
                except Exception:
                    pass
            return True

        rows = []

        if category in ['all', 'attendance']:
            logs = AttendanceLog.objects.select_related('employee__user').order_by('-date', '-check_in')[:300]
            for a in logs:
                if a.check_in:
                    rows.append({
                        'id': f'att-in-{a.id}',
                        'timestamp': a.check_in.isoformat(),
                        'user': a.employee.name,
                        'userId': f'VTL-{str(a.employee_id).zfill(3)}',
                        'role': a.employee.user.role.upper(),
                        'action': 'attendance.check_in',
                        'resource': f'attendance ({a.date})',
                        'ip': '-',
                        'status': 'Success',
                        'category': 'Attendance',
                    })
                if a.check_out:
                    rows.append({
                        'id': f'att-out-{a.id}',
                        'timestamp': a.check_out.isoformat(),
                        'user': a.employee.name,
                        'userId': f'VTL-{str(a.employee_id).zfill(3)}',
                        'role': a.employee.user.role.upper(),
                        'action': 'attendance.check_out',
                        'resource': f'attendance ({a.date})',
                        'ip': '-',
                        'status': 'Success',
                        'category': 'Attendance',
                    })

        if category in ['all', 'leave']:
            leaves = LeaveRequest.objects.select_related('employee__user', 'reviewed_by').order_by('-applied_at')[:300]
            for l in leaves:
                rows.append({
                    'id': f'leave-apply-{l.id}',
                    'timestamp': l.applied_at.isoformat(),
                    'user': l.employee.name,
                    'userId': f'VTL-{str(l.employee_id).zfill(3)}',
                    'role': l.employee.user.role.upper(),
                    'action': 'leave.apply',
                    'resource': f'{l.leave_type} ({l.start_date} to {l.end_date})',
                    'ip': '-',
                    'status': 'Success',
                    'category': 'Leave',
                })
                if l.status in ['approved', 'rejected'] and l.reviewed_by:
                    rows.append({
                        'id': f'leave-review-{l.id}',
                        'timestamp': l.applied_at.isoformat(),
                        'user': l.reviewed_by.email,
                        'userId': f'USER-{l.reviewed_by.id}',
                        'role': l.reviewed_by.role.upper(),
                        'action': f'leave.{l.status}',
                        'resource': f'leave-request ({l.id})',
                        'ip': '-',
                        'status': 'Success',
                        'category': 'Leave',
                    })

        if category in ['all', 'auth']:
            employees = Employee.objects.select_related('user').order_by('-id')[:200]
            for e in employees:
                rows.append({
                    'id': f'auth-user-{e.id}',
                    'timestamp': e.created_at.isoformat(),
                    'user': e.name,
                    'userId': f'VTL-{str(e.id).zfill(3)}',
                    'role': e.user.role.upper(),
                    'action': 'auth.account_created',
                    'resource': 'user',
                    'ip': '-',
                    'status': 'Success',
                    'category': 'Auth',
                })

        if category in ['all', 'settings']:
            updates = DailyUpdate.objects.select_related('employee__user').order_by('-created_at')[:300]
            for u in updates:
                rows.append({
                    'id': f'update-{u.id}',
                    'timestamp': u.created_at.isoformat(),
                    'user': u.employee.name,
                    'userId': f'VTL-{str(u.employee_id).zfill(3)}',
                    'role': u.employee.user.role.upper(),
                    'action': 'updates.post',
                    'resource': 'daily-update',
                    'ip': '-',
                    'status': 'Success',
                    'category': 'Settings',
                })

        filtered = []
        for r in rows:
            try:
                ts = timezone.datetime.fromisoformat(r['timestamp'].replace('Z', '+00:00'))
            except Exception:
                continue
            if not in_range(ts):
                continue
            if query:
                hay = f"{r['user']} {r['userId']} {r['action']} {r['resource']} {r['ip']} {r['category']}".lower()
                if query not in hay:
                    continue
            filtered.append(r)

        filtered.sort(key=lambda x: x['timestamp'], reverse=True)
        return Response(filtered[:500])


class SecurityOverviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in ['admin', 'hr']:
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        logs = AttendanceLog.objects.select_related('employee__user').order_by('-date', '-check_in')[:150]

        login_logs = []
        face_logs = []
        for l in logs:
            if l.check_in:
                login_logs.append({
                    'id': f'login-{l.id}',
                    'user': l.employee.name,
                    'device': 'Web browser',
                    'ip': '-',
                    'timestamp': l.check_in.isoformat(),
                    'status': 'success',
                })
                face_logs.append({
                    'id': f'face-in-{l.id}',
                    'user': l.employee.name,
                    'event': 'check-in',
                    'confidence': None,
                    'timestamp': l.check_in.isoformat(),
                    'status': 'verified',
                })
            if l.check_out:
                face_logs.append({
                    'id': f'face-out-{l.id}',
                    'user': l.employee.name,
                    'event': 'check-out',
                    'confidence': None,
                    'timestamp': l.check_out.isoformat(),
                    'status': 'verified',
                })

        return Response({
            'login_logs': login_logs[:20],
            'face_logs': face_logs[:20],
        })


class PushPublicKeyView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not settings.WEB_PUSH_PUBLIC_KEY:
            return Response({'error': 'Web push is not configured.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({'publicKey': settings.WEB_PUSH_PUBLIC_KEY})


class PushSubscribeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        subscription = request.data.get('subscription') or {}
        endpoint = subscription.get('endpoint')
        keys = subscription.get('keys') or {}
        p256dh = keys.get('p256dh')
        auth = keys.get('auth')
        if not endpoint or not p256dh or not auth:
            return Response({'error': 'Invalid subscription payload.'}, status=400)

        PushSubscription.objects.update_or_create(
            endpoint=endpoint,
            defaults={
                'user': request.user,
                'p256dh': p256dh,
                'auth': auth,
                'user_agent': request.META.get('HTTP_USER_AGENT', ''),
            }
        )
        return Response({'message': 'Push subscription saved.'})


class PushUnsubscribeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        endpoint = request.data.get('endpoint')
        if not endpoint:
            return Response({'error': 'endpoint is required.'}, status=400)
        PushSubscription.objects.filter(user=request.user, endpoint=endpoint).delete()
        return Response({'message': 'Push subscription removed.'})


class PushLunchReminderView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role not in ['admin', 'hr']:
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        phase = (request.data.get('phase') or 'start').strip().lower()
        if phase == 'end':
            title = 'Break Duration Alert'
            body = 'You have completed a 30-minute break.'
            ntype = 'warning'
        else:
            title = 'Lunch Break Reminder'
            body = "It's 1:00 PM. Please take your lunch break."
            ntype = 'info'

        payload = (
            '{"title":"%s","body":"%s","type":"%s","icon":"/vtl-logo.svg","url":"/employee"}'
            % (title.replace('"', '\\"'), body.replace('"', '\\"'), ntype)
        )
        subscriptions = list(PushSubscription.objects.select_related('user').all())

        def _send_push():
            send_push_message(subscriptions, payload)

        threading.Thread(target=_send_push, daemon=True).start()
        return Response({'message': 'Push queued.', 'phase': phase})


class MyNotificationsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = request.user.notifications.order_by('-created_at')[:50]
        serializer = AppNotificationSerializer(qs, many=True)
        return Response(serializer.data)


class MarkNotificationsReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        request.user.notifications.filter(read=False).update(read=True)
        return Response({'message': 'Notifications marked as read.'})


class AppraisalCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role not in ['admin', 'manager', 'hr']:
            return Response({'error': 'Permission denied.'}, status=403)

        employee_id = request.data.get('employee_id')
        message = (request.data.get('message') or '').strip()
        try:
            rating = int(request.data.get('rating', 5))
        except (TypeError, ValueError):
            rating = 5
        rating = max(1, min(5, rating))

        if not employee_id:
            return Response({'error': 'employee_id is required.'}, status=400)
        if not message:
            return Response({'error': 'Appraisal message is required.'}, status=400)
        if len(message) < 10:
            return Response({'error': 'Message must be at least 10 characters.'}, status=400)

        employee = Employee.objects.select_related('user').filter(pk=employee_id).first()
        if not employee:
            return Response({'error': 'Employee not found.'}, status=404)

        giver_name = request.user.get_full_name().strip() or request.user.email
        appraisal = Appraisal.objects.create(
            employee=employee,
            given_by=request.user,
            rating=rating,
            message=message,
        )

        AppNotification.objects.create(
            user=employee.user,
            title='Performance appraisal',
            body=(
                f'{giver_name} shared feedback ({rating}/5): '
                f'{message[:240]}{"…" if len(message) > 240 else ""}'
            ),
            type='success',
        )

        return Response(
            {
                'message': 'Appraisal sent and employee notified.',
                'id': appraisal.id,
                'employee_name': employee.name,
                'rating': rating,
            },
            status=201,
        )


class MyAppraisalsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            employee = request.user.employee
        except Employee.DoesNotExist:
            return Response([])

        rows = []
        for a in Appraisal.objects.filter(employee=employee).select_related('given_by')[:30]:
            giver = a.given_by
            rows.append({
                'id': a.id,
                'rating': a.rating,
                'message': a.message,
                'given_by': (
                    giver.get_full_name().strip() or giver.email if giver else 'Manager'
                ),
                'created_at': a.created_at.isoformat(),
            })
        return Response(rows)