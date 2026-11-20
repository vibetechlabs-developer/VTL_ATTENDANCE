from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from .models import DailyUpdate
from .serializers import DailyUpdateSerializer

SALES_REQUIRED_REPORT_FIELDS = [
    "total_calls",
    "meetings",
    "mail_sent",
    "linkedin_connections",
    "linkedin_messages",
    "today_summary",
]

SALES_MINIMUMS = {
    "meetings": 1,
    "mail_sent": 20,
    "linkedin_connections": 20,
}


def _int_or_none(value):
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _normalize_url(url):
    if not isinstance(url, str):
        return ""
    u = url.strip()
    if not u:
        return ""
    # Normalize a bit so the same link is detected (case + trailing slash).
    u = u.lower()
    while u.endswith("/") and len(u) > 8:
        u = u[:-1]
    return u


def _split_links(value):
    if not isinstance(value, str):
        return []
    parts = []
    for p in value.replace(",", "\n").splitlines():
        n = _normalize_url(p)
        if n:
            parts.append(n)
    return parts


class DailyUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        text = request.data.get('update_text')
        if not text:
            return Response({'error': 'Update text is required.'}, status=400)

        if not hasattr(request.user, 'employee'):
            return Response({'error': 'No employee profile linked to this account.'}, status=400)

        report_data = request.data.get('report_data')
        if report_data is not None and not isinstance(report_data, dict):
            return Response({'error': 'report_data must be an object.'}, status=400)

        custom_date = None
        date_str = request.data.get('date')
        if date_str:
            try:
                from datetime import datetime
                parsed = datetime.strptime(str(date_str).strip(), '%Y-%m-%d').date()
                if parsed > timezone.now().date():
                    return Response({'error': 'Update date cannot be in the future.'}, status=400)
                custom_date = parsed
            except ValueError:
                return Response({'error': 'Invalid date format. Use YYYY-MM-DD.'}, status=400)

        from users.role_utils import user_has_role

        if user_has_role(request.user, 'sales'):
            if not isinstance(report_data, dict):
                return Response({'error': 'Sales daily report is compulsory before check-out.'}, status=400)

            # 1) Fetch calls target from active task assigned to this employee (if any)
            import re as _re
            from .models import Task
            today = timezone.now().date()
            emp = request.user.employee
            active_task = Task.objects.filter(
                assigned_to=emp,
                status__in=['pending', 'in_progress'],
            ).order_by('-created_at').first()

            calls_minimum = 0
            has_calls_target = False
            if active_task:
                desc = f"{active_task.title or ''} {active_task.description or ''}"
                match = _re.search(r'(\d+)\s*(?:calls?|total\s*calls?)', desc, _re.IGNORECASE)
                if not match:
                    match = _re.search(r'(?:calls?|total\s*calls?)\s*[:=-]?\s*(\d+)', desc, _re.IGNORECASE)
                if match:
                    calls_minimum = int(match.group(1))
                    has_calls_target = True

            # 2) Required fields — all must be present and non-empty
            # (total_calls is only compulsory if manager assigned a calls target)
            missing_fields = []
            for field in SALES_REQUIRED_REPORT_FIELDS:
                if field == "total_calls" and not has_calls_target:
                    continue
                val = report_data.get(field)
                if val is None or (isinstance(val, str) and not val.strip()):
                    missing_fields.append(field)

            if missing_fields:
                return Response({
                    'error': 'Sales daily report is incomplete. Fill all compulsory fields before check-out.',
                    'missing_fields': missing_fields,
                }, status=400)

            # 3) Numeric minimums
            invalid_fields = []

            # total_calls — only enforced if manager explicitly assigned a calls target
            total_calls_val = _int_or_none(report_data.get('total_calls'))
            if has_calls_target and calls_minimum > 0:
                if total_calls_val is None:
                    invalid_fields.append({'field': 'total_calls', 'minimum': calls_minimum, 'actual': report_data.get('total_calls')})
                elif total_calls_val < calls_minimum:
                    invalid_fields.append({'field': 'total_calls', 'minimum': calls_minimum, 'actual': total_calls_val})

            # meetings — min 1
            meetings_val = _int_or_none(report_data.get('meetings'))
            if meetings_val is None:
                invalid_fields.append({'field': 'meetings', 'minimum': 1, 'actual': report_data.get('meetings')})
            elif meetings_val < 1:
                invalid_fields.append({'field': 'meetings', 'minimum': 1, 'actual': meetings_val})

            # mail_sent — combined total min 20
            mail_val = _int_or_none(report_data.get('mail_sent'))
            if mail_val is None:
                invalid_fields.append({'field': 'mail_sent', 'minimum': 20, 'actual': report_data.get('mail_sent')})
            elif mail_val < 20:
                invalid_fields.append({'field': 'mail_sent', 'minimum': 20, 'actual': mail_val})

            # linkedin_connections — min 20
            lc_val = _int_or_none(report_data.get('linkedin_connections'))
            if lc_val is None:
                invalid_fields.append({'field': 'linkedin_connections', 'minimum': 20, 'actual': report_data.get('linkedin_connections')})
            elif lc_val < 20:
                invalid_fields.append({'field': 'linkedin_connections', 'minimum': 20, 'actual': lc_val})

            if invalid_fields:
                return Response({
                    'error': 'Sales daily report is not meeting compulsory targets.',
                    'invalid_fields': invalid_fields,
                }, status=400)

        create_kwargs = {
            'employee': request.user.employee,
            'update_text': text,
            'report_data': report_data if isinstance(report_data, dict) else None,
        }
        if custom_date:
            create_kwargs['date'] = custom_date

        update = DailyUpdate.objects.create(**create_kwargs)
        return Response({
            'message': 'Update submitted successfully.',
            'date': update.date
        })

    def get(self, request):
        date_filter = request.query_params.get('date')
        employee_id = request.query_params.get('employee_id')
        all_flag = str(request.query_params.get('all', '')).lower() in ['1', 'true', 'yes']

        if all_flag and request.user.role in ['admin', 'manager', 'hr']:
            updates = DailyUpdate.objects.select_related('employee__user').all().order_by('-created_at')
        else:
            employee = get_or_create_employee(request.user)
            if not employee:
                return Response([])
            updates = DailyUpdate.objects.filter(employee=employee).select_related('employee__user').order_by('-created_at')

        if employee_id and request.user.role in ['admin', 'manager', 'hr']:
            updates = updates.filter(employee_id=employee_id)

        if date_filter and str(date_filter).lower() not in ['all', '']:
            updates = updates.filter(date=date_filter)

        serializer = DailyUpdateSerializer(updates, many=True)
        return Response(serializer.data)

    def delete(self, request, pk=None):
        update_id = pk or request.query_params.get('id') or request.data.get('id') or request.data.get('update_id')
        if not update_id:
            return Response({'error': 'Update ID is required.'}, status=400)
        try:
            update = DailyUpdate.objects.get(pk=update_id)
        except DailyUpdate.DoesNotExist:
            return Response({'error': 'Update not found.'}, status=404)

        is_owner = hasattr(request.user, 'employee') and update.employee == request.user.employee
        is_admin_or_manager = request.user.role in ['admin', 'manager', 'hr'] or request.user.is_superuser

        if is_owner or is_admin_or_manager:
            update.delete()
            return Response({'message': 'Update deleted successfully.'})
        else:
            return Response({'error': 'You do not have permission to delete this update.'}, status=403)


class DailyUpdateDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        try:
            update = DailyUpdate.objects.get(pk=pk)
        except DailyUpdate.DoesNotExist:
            return Response({'error': 'Update not found.'}, status=404)

        is_owner = hasattr(request.user, 'employee') and update.employee == request.user.employee
        is_admin_or_manager = request.user.role in ['admin', 'manager', 'hr'] or request.user.is_superuser

        if is_owner or is_admin_or_manager:
            update.delete()
            return Response({'message': 'Update deleted successfully.'})
        else:
            return Response({'error': 'You do not have permission to delete this update.'}, status=403)



from datetime import timedelta
from rest_framework import viewsets, permissions, serializers, exceptions
from rest_framework.decorators import action
from .models import Task
from .serializers import TaskSerializer

from users.utils import get_or_create_employee
from users.models import Employee
from django.db.models import Q



class TaskViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = TaskSerializer

    def get_queryset(self):
        user = self.request.user
        emp = get_or_create_employee(user)
        queryset = Task.objects.select_related('assigned_to', 'assigned_by').all()
        managed_emps = Employee.objects.filter(Q(manager=user) | Q(managers=user))
        is_manager_or_admin = user.role in ['admin', 'manager', 'hr'] or user.is_superuser or managed_emps.exists()

        scope = self.request.query_params.get('scope')
        if scope == 'mine' and emp:
            queryset = queryset.filter(assigned_to=emp)
        elif scope == 'assigned_by_me':
            queryset = queryset.filter(assigned_by=user)
        elif not is_manager_or_admin:
            # Normal employees and interns only see tasks assigned to them
            if emp:
                queryset = queryset.filter(assigned_to=emp)
            else:
                queryset = Task.objects.none()
        elif user.role != 'admin' and not user.is_superuser:
            # Managers / Sales Managers see tasks assigned to them, created by them, or assigned to employees reporting to them
            queryset = queryset.filter(Q(assigned_to=emp) | Q(assigned_by=user) | Q(assigned_to__in=managed_emps))

        # Status filter
        status_param = self.request.query_params.get('status')
        if status_param:
            queryset = queryset.filter(status=status_param)

        # Overdue filter
        overdue_param = self.request.query_params.get('overdue')
        if overdue_param == '1':
            queryset = queryset.filter(due_datetime__lt=timezone.now()).exclude(status__in=['completed', 'reviewed', 'cancelled'])

        return queryset.distinct()

    def perform_create(self, serializer):
        user = self.request.user
        managed_emps = Employee.objects.filter(Q(manager=user) | Q(managers=user))
        can_assign = (
            user.role in ['admin', 'manager', 'hr'] or
            user.is_staff or
            user.is_superuser or
            managed_emps.exists()
        )

        if not can_assign:
            raise exceptions.PermissionDenied("You do not have permission to assign tasks.")

        assigned_to_id = self.request.data.get('assigned_to')
        if not assigned_to_id:
            raise serializers.ValidationError({'assigned_to': 'Employee ID is required.'})

        target_emp = Employee.objects.filter(id=assigned_to_id).first()
        if not target_emp:
            raise serializers.ValidationError({'assigned_to': 'Selected employee does not exist.'})

        # Super Admin / Admin can assign to anyone
        if user.role == 'admin' or user.is_superuser:
            pass
        else:
            is_subordinate = (
                target_emp.manager == user or
                user in target_emp.managers.all() or
                target_emp in managed_emps
            )
            if not is_subordinate:
                raise exceptions.PermissionDenied("Managers can only assign tasks to employees or interns reporting to them.")

        due_datetime_raw = self.request.data.get('due_datetime')
        extra_kwargs = {'assigned_by': user}
        if due_datetime_raw:
            if isinstance(due_datetime_raw, str):
                from django.utils.dateparse import parse_datetime
                parsed_dt = parse_datetime(due_datetime_raw)
                if parsed_dt:
                    extra_kwargs['due_datetime'] = parsed_dt
            else:
                extra_kwargs['due_datetime'] = due_datetime_raw
        else:
            extra_kwargs['due_datetime'] = timezone.now() + timedelta(days=7)

        task = serializer.save(**extra_kwargs)

        # Create notification for assignee
        try:
            from users.models import AppNotification
            AppNotification.objects.create(
                user=task.assigned_to.user,
                title="Task Assigned",
                body=f"You have been assigned a task: {task.title}",
                type="info"
            )
        except Exception:
            pass

    def perform_update(self, serializer):
        user = self.request.user
        instance = serializer.instance
        status_val = self.request.data.get('status')
        emp = get_or_create_employee(user)

        is_creator = (instance.assigned_by == user)
        is_manager_of_assignee = (
            instance.assigned_to.manager == user or
            user in instance.assigned_to.managers.all()
        )
        is_assignee = (emp and instance.assigned_to == emp)
        is_admin = (user.role == 'admin' or user.is_superuser)

        if not (is_admin or is_creator or is_manager_of_assignee or is_assignee):
            raise exceptions.PermissionDenied("You do not have permission to update this task.")

        # Employee (assignee) updating: can accept, complete, toggle status, update completion notes, delay reason, or extend due date
        if is_assignee and not (is_admin or is_creator or is_manager_of_assignee):
            allowed_statuses = ['pending', 'in_progress', 'completed', 'reopened']
            if status_val and status_val not in allowed_statuses:
                raise exceptions.PermissionDenied("Employees and Interns can only accept, complete, or update assigned tasks.")

        due_datetime_raw = self.request.data.get('due_datetime')
        extra_kwargs = {}
        if due_datetime_raw:
            if isinstance(due_datetime_raw, str):
                from django.utils.dateparse import parse_datetime
                parsed_dt = parse_datetime(due_datetime_raw)
                if parsed_dt:
                    extra_kwargs['due_datetime'] = parsed_dt
            else:
                extra_kwargs['due_datetime'] = due_datetime_raw

        if status_val == 'completed' and not instance.completed_at:
            extra_kwargs['completed_at'] = timezone.now()

        serializer.save(**extra_kwargs)

    def perform_destroy(self, instance):
        user = self.request.user
        is_creator = (instance.assigned_by == user)
        is_manager_of_assignee = (
            instance.assigned_to.manager == user or
            user in instance.assigned_to.managers.all()
        )
        is_admin = (user.role == 'admin' or user.is_superuser)

        if not (is_admin or is_creator or is_manager_of_assignee):
            raise exceptions.PermissionDenied("You do not have permission to delete this task.")

        instance.delete()

    @action(detail=False, methods=['get'])
    def assignable_employees(self, request):
        user = request.user
        managed_emps = Employee.objects.filter(Q(manager=user) | Q(managers=user))

        if user.role == 'admin' or user.is_superuser:
            # Super Admin can assign tasks to anyone except themselves
            emps = (
                Employee.objects
                .select_related('user')
                .exclude(user=user)
            )
        elif managed_emps.exists():
            # Managers (including sales managers) can assign only to employees reporting to them
            emps = (
                managed_emps
                .select_related('user')
                .exclude(user=user)
                .distinct()
            )
        elif user.role in ['manager', 'hr']:
            emps = (
                Employee.objects
                .select_related('user')
                .filter(Q(manager=user) | Q(managers=user))
                .exclude(user=user)
                .distinct()
            )
        else:
            # Regular employees with no subordinates see no assignable users
            emps = Employee.objects.none()

        data = [
            {
                'id': e.id,
                'name': e.name or e.user.email.split('@')[0],
                'email': e.user.email,
                'department': e.department or 'General',
                'role': e.user.role,
            }
            for e in emps
        ]
        return Response(data)

    @action(detail=False, methods=['get'])
    def my_calls_target(self, request):
        emp = get_or_create_employee(request.user)
        target = 0
        has_target = False
        task_info = None
        if emp:
            active_task = (
                Task.objects.filter(
                    assigned_to=emp,
                    status__in=['pending', 'in_progress'],
                )
                .order_by('-created_at')
                .first()
            )
            if active_task:
                text = f"{active_task.title or ''} {active_task.description or ''}"
                import re as _re
                match = _re.search(r'(\d+)\s*(?:calls?|total\s*calls?)', text, _re.IGNORECASE)
                if not match:
                    match = _re.search(r'(?:calls?|total\s*calls?)\s*[:=-]?\s*(\d+)', text, _re.IGNORECASE)
                if match:
                    target = int(match.group(1))
                    has_target = True
                task_info = {
                    'id': active_task.id,
                    'title': active_task.title,
                }
        return Response({
            'calls_target': target,
            'has_target': has_target,
            'task': task_info,
        })