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
from .serializers import LoginSerializer, EmployeeListSerializer, EmployeeCreateSerializer, EmployeeUpdateSerializer
from .models import Employee, PushSubscription, User
from attendance.face_utils import decode_base64_image, get_face_encoding
from attendance.models import AttendanceLog
from leaves.models import LeaveRequest
from updates.models import DailyUpdate
from .push_utils import send_push_message
from .serializers_notifications import AppNotificationSerializer
import mimetypes

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

        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'role': user.role,
            'email': user.email,
            'name': name,
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
            'name': name,
            'department': emp.department if emp else '',
            'phone': (emp.phone or '') if emp else '',
            'empId': f'VTL-{str(emp.pk).zfill(3)}' if emp else f'VTL-{str(user.pk).zfill(3)}',
            'bio': '',
            'location': '',
            'avatar': avatar,
        })


class EmployeesListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        users = User.objects.select_related('employee').order_by('-id')
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
                'reportsTo': (
                    employee.manager.employee.name
                    if employee and employee.manager and hasattr(employee.manager, 'employee')
                    else (employee.manager.email if employee and employee.manager else '—')
                ),
                'joiningDate': (
                    employee.created_at.strftime('%Y-%m-%d')
                    if employee and employee.created_at
                    else user.date_joined.strftime('%Y-%m-%d')
                ),
                'faceStatus': 'registered' if employee and employee.face_encoding else 'pending',
                'avatar': avatar,
                'status': 'active' if user.is_active else 'inactive',
                'hasEmployeeProfile': bool(employee),
            })
        return Response(rows)


class EmployeesCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role not in ['admin', 'manager']:
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        serializer = EmployeeCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
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
        serializer.is_valid(raise_exception=True)
        serializer.update(employee, serializer.validated_data)
        row = EmployeeListSerializer(employee, context={'request': request}).data
        return Response({'employee': row})


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
            'has_face': bool(employee.face_encoding),
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
        subscriptions = PushSubscription.objects.select_related('user').all()
        sent = send_push_message(subscriptions, payload)
        return Response({'message': 'Push sent.', 'sent': sent, 'phase': phase})


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