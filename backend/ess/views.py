from django.utils import timezone
from rest_framework import viewsets, permissions, status
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .models import (
    ProfileChangeRequest,
    HRTicket,
    TicketComment,
    ALLOWED_CHANGE_FIELDS,
    SENSITIVE_FIELDS
)
from .serializers import (
    ProfileChangeRequestSerializer,
    HRTicketSerializer,
    TicketCommentSerializer
)
from users.models import Employee
from attendance.models import AttendanceLog
from leave.models import LeaveBalance, LeaveApplication


from users.utils import get_or_create_employee


def get_employee(request):
    if not request.user or not request.user.is_authenticated:
        return None
    return get_or_create_employee(request.user)



def is_hr_or_admin(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    if getattr(user, 'role', '') in ['admin', 'hr']:
        return True
    return False


class ESSDashboardView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        current_emp = get_employee(request)
        if not current_emp:
            return Response({'error': 'Employee profile required.'}, status=status.HTTP_400_BAD_REQUEST)

        today = timezone.now().date()
        year = today.year

        # 1. Today's attendance status
        att_log = AttendanceLog.objects.filter(employee=current_emp, date=today).first()
        attendance_data = {
            'date': str(today),
            'status': att_log.status if att_log else 'absent',
            'check_in': str(att_log.check_in) if att_log and att_log.check_in else None,
            'check_out': str(att_log.check_out) if att_log and att_log.check_out else None,
        }

        # 2. Current leave balances
        balances = LeaveBalance.objects.filter(employee=current_emp, year=year)
        leave_balances_data = [
            {
                'leave_type': b.leave_type.code,
                'leave_type_name': b.leave_type.name,
                'allocated': float(b.allocated),
                'used': float(b.used),
                'balance': float(b.balance)
            }
            for b in balances
        ]

        # 3. Tasks count (safe fallback)
        tasks_count = 0

        # 4. Pending approvals for managers / HR
        pending_approvals = {
            'pending_leaves_count': 0,
            'pending_profile_changes_count': 0,
            'items': []
        }

        # If user is manager or HR, gather pending leave applications to review
        managed_emps = Employee.objects.filter(models.Q(manager=request.user) | models.Q(managers=request.user))
        if managed_emps.exists() or is_hr_or_admin(request.user):
            pending_leaves = LeaveApplication.objects.filter(status='pending')
            if not is_hr_or_admin(request.user):
                pending_leaves = pending_leaves.filter(employee__in=managed_emps)

            pending_approvals['pending_leaves_count'] = pending_leaves.count()
            for l in pending_leaves[:5]:
                pending_approvals['items'].append({
                    'type': 'leave_application',
                    'id': l.id,
                    'title': f"Leave request by {l.employee.name} ({l.leave_type.code})",
                    'applied_on': str(l.applied_on)
                })

        if is_hr_or_admin(request.user):
            pending_profile_changes = ProfileChangeRequest.objects.filter(status='pending')
            pending_approvals['pending_profile_changes_count'] = pending_profile_changes.count()
            for p in pending_profile_changes[:5]:
                pending_approvals['items'].append({
                    'type': 'profile_change_request',
                    'id': p.id,
                    'title': f"Profile change for {p.employee.name} ({p.field_name})",
                    'requested_on': str(p.requested_on)
                })

        return Response({
            'employee_name': current_emp.name,
            'attendance': attendance_data,
            'leave_balances': leave_balances_data,
            'tasks_count': tasks_count,
            'pending_approvals': pending_approvals
        })


class ProfileChangeRequestViewSet(viewsets.ModelViewSet):
    queryset = ProfileChangeRequest.objects.all()
    serializer_class = ProfileChangeRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        from django.db import models
        qs = ProfileChangeRequest.objects.all().select_related('employee', 'reviewed_by')
        scope = self.request.query_params.get('scope')
        status_param = self.request.query_params.get('status')
        current_emp = get_employee(self.request)

        if scope == 'mine' and current_emp:
            qs = qs.filter(employee=current_emp)
        elif scope == 'pending_review' and is_hr_or_admin(self.request.user):
            qs = qs.filter(status='pending')
        elif (scope in ['all', 'all_review', 'history'] or not scope) and is_hr_or_admin(self.request.user):
            pass
        elif scope == 'assigned' and current_emp:
            qs = qs.filter(models.Q(reviewed_by=current_emp) | models.Q(reviewed_by__isnull=True))
        elif not is_hr_or_admin(self.request.user) and current_emp:
            qs = qs.filter(employee=current_emp)

        if status_param and status_param != 'all':
            qs = qs.filter(status=status_param)

        return qs

    def create(self, request, *args, **kwargs):
        from django.db import models
        current_emp = get_employee(request)
        if not current_emp:
            return Response({'error': 'Employee profile required.'}, status=status.HTTP_400_BAD_REQUEST)

        field_name = request.data.get('field_name')
        requested_value = request.data.get('requested_value')

        if not field_name or field_name not in ALLOWED_CHANGE_FIELDS:
            return Response(
                {'error': f'Invalid field_name. Allowed fields: {", ".join(ALLOWED_CHANGE_FIELDS)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        old_val = str(getattr(current_emp, field_name, '') or '')

        # Auto-assign to first available HR employee (fallback to admin/staff)
        hr_emp = Employee.objects.filter(models.Q(user__role__iexact='hr')).first()
        if not hr_emp:
            hr_emp = Employee.objects.filter(models.Q(user__role__iexact='admin') | models.Q(user__is_staff=True)).first()
        if not hr_emp:
            hr_emp = Employee.objects.first()

        req_obj = ProfileChangeRequest.objects.create(
            employee=current_emp,
            field_name=field_name,
            old_value=old_val,
            requested_value=requested_value,
            status='pending',
            reviewed_by=hr_emp,   # pre-assign to HR for review
        )

        return Response(ProfileChangeRequestSerializer(req_obj).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def assign(self, request, pk=None):
        if not is_hr_or_admin(request.user):
            return Response({'error': 'Only HR/Admin can assign change requests.'}, status=status.HTTP_403_FORBIDDEN)

        req_obj = self.get_object()
        assigned_to_id = request.data.get('assigned_to')
        if assigned_to_id:
            try:
                assigned_emp = Employee.objects.get(id=assigned_to_id)
            except Employee.DoesNotExist:
                return Response({'error': 'Assigned employee not found.'}, status=status.HTTP_404_NOT_FOUND)
        else:
            assigned_emp = get_employee(request)
            if not assigned_emp:
                return Response({'error': 'HR employee profile required.'}, status=status.HTTP_400_BAD_REQUEST)

        req_obj.reviewed_by = assigned_emp
        req_obj.save()

        return Response(ProfileChangeRequestSerializer(req_obj).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        if not is_hr_or_admin(request.user):
            return Response({'error': 'Only HR/Admin can approve profile change requests.'}, status=status.HTTP_403_FORBIDDEN)

        req_obj = self.get_object()
        if req_obj.status != 'pending':
            return Response({'error': f'Request is already {req_obj.status}.'}, status=status.HTTP_400_BAD_REQUEST)

        # Whitelist check before setting attribute
        if req_obj.field_name not in ALLOWED_CHANGE_FIELDS:
            return Response(
                {'error': f'Field {req_obj.field_name} is not allowed for profile updates.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Update field on Employee record if attribute exists
        if hasattr(req_obj.employee, req_obj.field_name):
            setattr(req_obj.employee, req_obj.field_name, req_obj.requested_value)
            req_obj.employee.save()

        current_emp = get_employee(request)
        req_obj.status = 'approved'
        if current_emp:
            req_obj.reviewed_by = current_emp
        req_obj.reviewed_on = timezone.now()
        req_obj.save()

        return Response(ProfileChangeRequestSerializer(req_obj).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        if not is_hr_or_admin(request.user):
            return Response({'error': 'Only HR/Admin can reject profile change requests.'}, status=status.HTTP_403_FORBIDDEN)

        req_obj = self.get_object()
        if req_obj.status != 'pending':
            return Response({'error': f'Request is already {req_obj.status}.'}, status=status.HTTP_400_BAD_REQUEST)

        current_emp = get_employee(request)
        req_obj.status = 'rejected'
        if current_emp:
            req_obj.reviewed_by = current_emp
        req_obj.reviewed_on = timezone.now()
        req_obj.save()

        return Response(ProfileChangeRequestSerializer(req_obj).data, status=status.HTTP_200_OK)


class HRTicketViewSet(viewsets.ModelViewSet):
    queryset = HRTicket.objects.all()
    serializer_class = HRTicketSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = HRTicket.objects.all()
        current_emp = get_employee(self.request)

        # Admin and HR role users see ALL support tickets
        if is_hr_or_admin(self.request.user):
            return qs

        # Regular employees see tickets created by them OR assigned to them
        if current_emp:
            return qs.filter(Q(employee=current_emp) | Q(assigned_to=current_emp))

        return qs.none()

    def perform_create(self, serializer):
        current_emp = get_employee(self.request)

        # Auto-assign ticket to HR employee if present
        hr_emp = Employee.objects.filter(user__role='hr').first()
        if not hr_emp:
            # Fallback to any staff or first employee if no explicit 'hr' role exists
            hr_emp = Employee.objects.filter(user__is_staff=True).first()

        serializer.save(
            employee=current_emp,
            assigned_to=hr_emp,
            status='open'
        )


    @action(detail=True, methods=['post'])
    def assign(self, request, pk=None):
        if not is_hr_or_admin(request.user):
            return Response({'error': 'Only HR/Admin can assign tickets.'}, status=status.HTTP_403_FORBIDDEN)

        ticket = self.get_object()
        assigned_to_id = request.data.get('assigned_to')

        if not assigned_to_id:
            return Response({'error': 'assigned_to employee ID is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            assigned_emp = Employee.objects.get(id=assigned_to_id)
        except Employee.DoesNotExist:
            return Response({'error': 'Assigned employee not found.'}, status=status.HTTP_404_NOT_FOUND)

        ticket.assigned_to = assigned_emp
        ticket.status = 'in_progress'
        ticket.save()

        return Response(HRTicketSerializer(ticket).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        ticket = self.get_object()
        current_emp = get_employee(request)

        # Allow assigned HR or HR/Admin or author to mark resolved
        if not is_hr_or_admin(request.user) and current_emp != ticket.employee and current_emp != ticket.assigned_to:
            return Response({'error': 'Not authorized to resolve this ticket.'}, status=status.HTTP_403_FORBIDDEN)

        ticket.status = 'resolved'
        ticket.resolved_on = timezone.now()
        ticket.save()

        return Response(HRTicketSerializer(ticket).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def reopen(self, request, pk=None):
        """Allow HR/Admin to reopen a resolved ticket for further discussion."""
        if not is_hr_or_admin(request.user):
            return Response({'error': 'Only HR/Admin can reopen tickets.'}, status=status.HTTP_403_FORBIDDEN)

        ticket = self.get_object()
        ticket.status = 'in_progress'
        ticket.resolved_on = None
        ticket.save()

        return Response(HRTicketSerializer(ticket).data, status=status.HTTP_200_OK)


class TicketCommentViewSet(viewsets.ModelViewSet):
    queryset = TicketComment.objects.all()
    serializer_class = TicketCommentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        from users.utils import get_or_create_employee
        current_emp = get_or_create_employee(self.request.user)
        serializer.save(author=current_emp)
