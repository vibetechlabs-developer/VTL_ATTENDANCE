from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from .models import DailyUpdate
from .serializers import DailyUpdateSerializer

SALES_REQUIRED_REPORT_FIELDS = [
    "total_calls",
    "calls_received",
    "meetings",
    "clients_done",
    "data_extracted_india",
    "data_extracted_abroad",
    "mail_sent_b2b",
    "mail_sent_general",
    "linkedin_post",
    "linkedin_connections",
    "linkedin_messages",
    "linkedin_data_extracted",
    "newspaper_read",
    "newspaper_important_news",
    "group_photos_added",
]

SALES_MINIMUMS = {
    "total_calls": 100,
    "calls_received": 80,
    "data_extracted_india": 500,
    "data_extracted_abroad": 500,
    "mail_sent_b2b": 10,
    "mail_sent_general": 10,
    "linkedin_connections": 0,
    "linkedin_messages": 100,
    "linkedin_data_extracted": 25,
}

SALES_BLOG_PPT_MIN = 1
SALES_BUSINESS_CLASSIFIED_MIN = 5


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

            # 1) Required fields (except Blog/PPT and Business/Classified OR-groups)
            required_single_fields = [
                f
                for f in SALES_REQUIRED_REPORT_FIELDS
                if f
                not in [
                    "blog_posts",
                    "ppt_posts",
                    "business_listings",
                    "classified_ads",
                    "newspaper_important_news",  # required only when newspaper_read is true
                ]
            ]
            missing_fields = [field for field in required_single_fields if report_data.get(field) in [None, ""]]
            # Booleans: group_photos_added must be explicitly confirmed (True).
            if report_data.get("group_photos_added") is not True and "group_photos_added" not in missing_fields:
                missing_fields.append("group_photos_added")
            if missing_fields:
                return Response({
                    'error': 'Sales daily report is incomplete. Fill all compulsory fields before check-out.',
                    'missing_fields': missing_fields,
                }, status=400)

            # 2) OR-group: (Blog OR PPT) => minimum 1 in either
            blog_num = _int_or_none(report_data.get("blog_posts"))
            ppt_num = _int_or_none(report_data.get("ppt_posts"))
            blog_ok = blog_num is not None and blog_num >= SALES_BLOG_PPT_MIN
            ppt_ok = ppt_num is not None and ppt_num >= SALES_BLOG_PPT_MIN

            invalid_fields = []
            if not (blog_ok or ppt_ok):
                invalid_fields.extend([
                    {"field": "blog_posts", "minimum": SALES_BLOG_PPT_MIN, "actual": report_data.get("blog_posts")},
                    {"field": "ppt_posts", "minimum": SALES_BLOG_PPT_MIN, "actual": report_data.get("ppt_posts")},
                ])

            # 3) OR-group: (Business listings OR Classified ads) => minimum 5 in either
            business_num = _int_or_none(report_data.get("business_listings"))
            classified_num = _int_or_none(report_data.get("classified_ads"))
            business_ok = business_num is not None and business_num >= SALES_BUSINESS_CLASSIFIED_MIN
            classified_ok = classified_num is not None and classified_num >= SALES_BUSINESS_CLASSIFIED_MIN

            if not (business_ok or classified_ok):
                invalid_fields.extend([
                    {"field": "business_listings", "minimum": SALES_BUSINESS_CLASSIFIED_MIN, "actual": report_data.get("business_listings")},
                    {"field": "classified_ads", "minimum": SALES_BUSINESS_CLASSIFIED_MIN, "actual": report_data.get("classified_ads")},
                ])

            # 3b) If counts are ok, require corresponding links
            blog_links = (report_data.get("blog_links") or "").strip()
            ppt_links = (report_data.get("ppt_links") or "").strip()
            business_links = (report_data.get("business_links") or "").strip()
            classified_links = (report_data.get("classified_links") or "").strip()

            if blog_ok and not blog_links:
                invalid_fields.append({"field": "blog_links", "minimum": 1, "actual": 0})
            if ppt_ok and not ppt_links:
                invalid_fields.append({"field": "ppt_links", "minimum": 1, "actual": 0})
            if business_ok and not business_links:
                invalid_fields.append({"field": "business_links", "minimum": 5, "actual": 0})
            if classified_ok and not classified_links:
                invalid_fields.append({"field": "classified_links", "minimum": 5, "actual": 0})

            # If 5 target reached, ensure at least 5 links are provided.
            if business_ok and business_links:
                business_link_count = len([l for l in business_links.replace(",", "\n").splitlines() if l.strip()])
                if business_link_count < 5:
                    invalid_fields.append({"field": "business_links", "minimum": 5, "actual": business_link_count})
            if classified_ok and classified_links:
                classified_link_count = len([l for l in classified_links.replace(",", "\n").splitlines() if l.strip()])
                if classified_link_count < 5:
                    invalid_fields.append({"field": "classified_links", "minimum": 5, "actual": classified_link_count})

            # Newspaper important news only required when newspaper_read is true.
            newspaper_read = report_data.get("newspaper_read")
            if newspaper_read is True and not (report_data.get("newspaper_important_news") or "").strip():
                invalid_fields.append({"field": "newspaper_important_news", "minimum": 1, "actual": 0})

            # 3c) Links must be new (not submitted earlier by same employee)
            current_links_by_field = {
                "blog_links": _split_links(blog_links),
                "ppt_links": _split_links(ppt_links),
                "business_links": _split_links(business_links),
                "classified_links": _split_links(classified_links),
            }

            previous_updates = (
                DailyUpdate.objects
                .filter(employee=request.user.employee)
                .exclude(report_data__isnull=True)
                .order_by("-created_at")[:200]
            )

            previously_used_links = set()
            for prev in previous_updates:
                prev_data = prev.report_data if isinstance(prev.report_data, dict) else {}
                for k in ["blog_links", "ppt_links", "business_links", "classified_links"]:
                    previously_used_links.update(_split_links(prev_data.get(k) or ""))

            duplicate_links = []
            for field, links in current_links_by_field.items():
                for link in links:
                    if link in previously_used_links:
                        duplicate_links.append({"field": field, "url": link})

            if duplicate_links:
                return Response({
                    "error": "Some links were already submitted before. Please add new links.",
                    "duplicate_links": duplicate_links,
                }, status=400)

            # 4) Remaining numeric minimums
            for field, minimum in SALES_MINIMUMS.items():
                raw_value = report_data.get(field)
                numeric_value = _int_or_none(raw_value)
                if numeric_value is None:
                    # Keep the error consistent with other minimum failures
                    invalid_fields.append({'field': field, 'minimum': minimum, 'actual': raw_value})
                    continue
                if numeric_value < minimum:
                    invalid_fields.append({'field': field, 'minimum': minimum, 'actual': numeric_value})

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

        scope = self.request.query_params.get('scope')
        if scope == 'mine' and emp:
            queryset = queryset.filter(assigned_to=emp)
        elif scope == 'assigned_by_me':
            queryset = queryset.filter(assigned_by=user)
        elif user.role not in ['admin', 'manager', 'hr'] and not user.is_superuser:
            # Normal employees and interns only see tasks assigned to them
            if emp:
                queryset = queryset.filter(assigned_to=emp)
            else:
                queryset = Task.objects.none()
        elif user.role in ['manager', 'hr'] and not user.is_superuser and user.role != 'admin':
            # Managers see tasks assigned to them, created by them, or assigned to employees reporting to them
            managed_emps = Employee.objects.filter(Q(manager=user) | Q(managers=user))
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

        # Employees and Interns CANNOT assign tasks
        if user.role in ['employee', 'intern'] and not user.is_staff and not user.is_superuser:
            raise exceptions.PermissionDenied("Employees and Interns cannot assign tasks.")

        assigned_to_id = self.request.data.get('assigned_to')
        if not assigned_to_id:
            raise serializers.ValidationError({'assigned_to': 'Employee ID is required.'})

        target_emp = Employee.objects.filter(id=assigned_to_id).first()
        if not target_emp:
            raise serializers.ValidationError({'assigned_to': 'Selected employee does not exist.'})

        # Super Admin / Admin can assign to anyone
        if user.role == 'admin' or user.is_superuser:
            pass
        elif user.role in ['manager', 'hr']:
            # Managers can only assign to employees or interns reporting to them
            is_subordinate = (
                target_emp.manager == user or
                user in target_emp.managers.all()
            )
            if not is_subordinate:
                raise exceptions.PermissionDenied("Managers can only assign tasks to employees or interns reporting to them.")
        else:
            raise exceptions.PermissionDenied("You do not have permission to assign tasks.")

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

        # Employee/Intern permission check
        if user.role in ['employee', 'intern'] and not user.is_staff and not user.is_superuser:
            emp = get_or_create_employee(user)
            if not emp or instance.assigned_to != emp:
                raise exceptions.PermissionDenied("You can only update tasks assigned to you.")
            
            # Employees/Interns can only change status to 'in_progress' or 'completed', and update 'completion_notes'
            allowed_statuses = ['in_progress', 'completed']
            if status_val and status_val not in allowed_statuses:
                raise exceptions.PermissionDenied("Employees and Interns can only accept or complete assigned tasks.")

        # Manager permission check
        elif user.role in ['manager', 'hr'] and not user.is_superuser and user.role != 'admin':
            is_creator = (instance.assigned_by == user)
            is_manager_of_assignee = (
                instance.assigned_to.manager == user or
                user in instance.assigned_to.managers.all()
            )
            if not is_creator and not is_manager_of_assignee:
                raise exceptions.PermissionDenied("Managers can only update tasks assigned by them or belonging to their team.")

        extra_kwargs = {}
        if status_val == 'completed' and not instance.completed_at:
            extra_kwargs['completed_at'] = timezone.now()

        serializer.save(**extra_kwargs)

    def perform_destroy(self, instance):
        user = self.request.user
        if user.role in ['employee', 'intern'] and not user.is_staff and not user.is_superuser:
            raise exceptions.PermissionDenied("Employees and Interns cannot delete tasks.")
        
        if user.role in ['manager', 'hr'] and not user.is_superuser and user.role != 'admin':
            is_creator = (instance.assigned_by == user)
            is_manager_of_assignee = (
                instance.assigned_to.manager == user or
                user in instance.assigned_to.managers.all()
            )
            if not is_creator and not is_manager_of_assignee:
                raise exceptions.PermissionDenied("Managers can only delete tasks created by them or belonging to their team.")

        instance.delete()

    @action(detail=False, methods=['get'])
    def assignable_employees(self, request):
        user = request.user

        if user.role == 'admin' or user.is_superuser:
            # Super Admin can assign tasks to anyone except themselves
            emps = (
                Employee.objects
                .select_related('user')
                .exclude(user=user)
            )
        elif user.role in ['manager', 'hr']:
            # Managers can assign only to employees or interns reporting to them
            emps = (
                Employee.objects
                .select_related('user')
                .filter(Q(manager=user) | Q(managers=user))
                .exclude(user=user)
                .distinct()
            )
        else:
            # Regular employees and interns see no assignable users
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