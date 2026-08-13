from django.utils import timezone
from decimal import Decimal
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import LeaveType, LeaveBalance, LeaveApplication, Holiday
from .serializers import (
    LeaveTypeSerializer,
    LeaveBalanceSerializer,
    LeaveApplicationSerializer,
    HolidaySerializer
)
from users.models import Employee
# Notification + Audit helpers (Module 10 wiring demonstration)
from notifications.helpers import notify, log_action


def get_employee(request):
    if not request.user or not request.user.is_authenticated:
        return None
    if hasattr(request.user, 'employee'):
        return request.user.employee
    return getattr(request, 'employee', None)


def is_hr_or_admin(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    if getattr(user, 'role', '') in ['admin', 'hr']:
        return True
    return False


def is_manager_of(manager_user, employee):
    if not manager_user or not employee:
        return False
    if employee.manager_id == manager_user.id:
        return True
    if employee.managers.filter(id=manager_user.id).exists():
        return True
    return False


class LeaveTypeViewSet(viewsets.ModelViewSet):
    queryset = LeaveType.objects.all()
    serializer_class = LeaveTypeSerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        if not is_hr_or_admin(self.request.user):
            raise permissions.PermissionDenied("Only Admin/HR can create leave types.")
        serializer.save()

    def perform_update(self, serializer):
        if not is_hr_or_admin(self.request.user):
            raise permissions.PermissionDenied("Only Admin/HR can update leave types.")
        serializer.save()

    def perform_destroy(self, instance):
        if not is_hr_or_admin(self.request.user):
            raise permissions.PermissionDenied("Only Admin/HR can delete leave types.")
        instance.delete()


class LeaveBalanceViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = LeaveBalance.objects.all()
    serializer_class = LeaveBalanceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = LeaveBalance.objects.all()
        scope = self.request.query_params.get('scope')
        current_emp = get_employee(self.request)
        if scope == 'mine' and current_emp:
            qs = qs.filter(employee=current_emp)
        elif is_hr_or_admin(self.request.user):
            emp_id = self.request.query_params.get('employee_id')
            if emp_id:
                qs = qs.filter(employee_id=emp_id)
        elif current_emp:
            qs = qs.filter(employee=current_emp)
        return qs


class LeaveApplicationViewSet(viewsets.ModelViewSet):
    queryset = LeaveApplication.objects.all()
    serializer_class = LeaveApplicationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = LeaveApplication.objects.all()
        scope = self.request.query_params.get('scope')
        status_param = self.request.query_params.get('status')
        current_emp = get_employee(self.request)

        if scope == 'mine' and current_emp:
            qs = qs.filter(employee=current_emp)
        elif scope == 'team' and current_emp:
            # Managed team members
            qs = qs.filter(employee__in=Employee.objects.filter(models.Q(manager=self.request.user) | models.Q(managers=self.request.user)))

        if status_param:
            qs = qs.filter(status=status_param)

        return qs

    def create(self, request, *args, **kwargs):
        current_emp = get_employee(request)
        if not current_emp:
            return Response({'error': 'Employee profile required.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        leave_type = data['leave_type']
        start_date = data['start_date']
        end_date = data['end_date']
        num_days = Decimal(str(data['number_of_days']))
        year = start_date.year

        # Check overlapping leaves (status not in rejected/cancelled)
        overlapping = LeaveApplication.objects.filter(
            employee=current_emp,
            status__in=['pending', 'approved'],
            start_date__lte=end_date,
            end_date__gte=start_date
        )
        if overlapping.exists():
            return Response(
                {'error': 'Overlapping leave dates exist for this employee.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check LeaveBalance
        balance_obj, _ = LeaveBalance.objects.get_or_create(
            employee=current_emp,
            leave_type=leave_type,
            year=year,
            defaults={'allocated': leave_type.annual_quota, 'used': Decimal('0')}
        )

        if balance_obj.balance < num_days:
            return Response(
                {
                    'error': f'Insufficient leave balance. Available: {balance_obj.balance}, Requested: {num_days}',
                    'available_balance': float(balance_obj.balance)
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        application = serializer.save(employee=current_emp, status='pending')
        return Response(LeaveApplicationSerializer(application).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        application = self.get_object()
        current_emp = get_employee(request)

        if not is_manager_of(request.user, application.employee) and not is_hr_or_admin(request.user):
            return Response({'error': 'Only employee manager or HR/Admin can approve leaves.'}, status=status.HTTP_403_FORBIDDEN)

        if application.status == 'approved':
            return Response({'error': 'Leave is already approved.'}, status=status.HTTP_400_BAD_REQUEST)

        year = application.start_date.year
        balance_obj, _ = LeaveBalance.objects.get_or_create(
            employee=application.employee,
            leave_type=application.leave_type,
            year=year,
            defaults={'allocated': application.leave_type.annual_quota, 'used': Decimal('0')}
        )

        num_days = Decimal(str(application.number_of_days))
        # Deduct balance by adding to used
        balance_obj.used += num_days
        balance_obj.save()

        application.status = 'approved'
        application.approved_by = current_emp
        application.approved_on = timezone.now()
        application.manager_remark = request.data.get('remark', '')
        application.save()

        # --- Notification + Audit wiring (Module 10 demonstration) ---
        notify(
            recipient_employee=application.employee,
            event_type='leave_approved',
            title='Your leave request was approved',
            body=(
                f'Your {application.leave_type.name} leave '
                f'from {application.start_date} to {application.end_date} '
                f'has been approved.'
            ),
            related_object={'type': 'LeaveApplication', 'id': application.id},
        )
        log_action(
            actor=current_emp,
            action='approved_leave',
            module='leave',
            object_repr=str(application),
            request=request,
        )
        # ---------------------------------------------------------------

        return Response(LeaveApplicationSerializer(application).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        application = self.get_object()
        current_emp = get_employee(request)

        if not is_manager_of(request.user, application.employee) and not is_hr_or_admin(request.user):
            return Response({'error': 'Only employee manager or HR/Admin can reject leaves.'}, status=status.HTTP_403_FORBIDDEN)

        # If previously approved, restore balance
        if application.status == 'approved':
            year = application.start_date.year
            try:
                balance_obj = LeaveBalance.objects.get(
                    employee=application.employee,
                    leave_type=application.leave_type,
                    year=year
                )
                balance_obj.used = max(Decimal('0'), balance_obj.used - Decimal(str(application.number_of_days)))
                balance_obj.save()
            except LeaveBalance.DoesNotExist:
                pass

        application.status = 'rejected'
        application.approved_by = current_emp
        application.approved_on = timezone.now()
        application.manager_remark = request.data.get('remark', '')
        application.save()

        # --- Notification + Audit wiring (Module 10 demonstration) ---
        notify(
            recipient_employee=application.employee,
            event_type='leave_rejected',
            title='Your leave request was rejected',
            body=(
                f'Your {application.leave_type.name} leave '
                f'from {application.start_date} to {application.end_date} '
                f'has been rejected. Remark: {application.manager_remark or "None"}'
            ),
            related_object={'type': 'LeaveApplication', 'id': application.id},
        )
        log_action(
            actor=current_emp,
            action='rejected_leave',
            module='leave',
            object_repr=str(application),
            request=request,
        )
        # ---------------------------------------------------------------

        return Response(LeaveApplicationSerializer(application).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        application = self.get_object()
        current_emp = get_employee(request)

        if current_emp != application.employee and not is_hr_or_admin(request.user):
            return Response({'error': 'Only the employee can cancel their own leave.'}, status=status.HTTP_403_FORBIDDEN)

        if application.status in ['rejected', 'cancelled']:
            return Response({'error': f'Leave is already {application.status}.'}, status=status.HTTP_400_BAD_REQUEST)

        # Restore balance if it was approved
        if application.status == 'approved':
            year = application.start_date.year
            try:
                balance_obj = LeaveBalance.objects.get(
                    employee=application.employee,
                    leave_type=application.leave_type,
                    year=year
                )
                balance_obj.used = max(Decimal('0'), balance_obj.used - Decimal(str(application.number_of_days)))
                balance_obj.save()
            except LeaveBalance.DoesNotExist:
                pass

        application.status = 'cancelled'
        application.save()

        return Response(LeaveApplicationSerializer(application).data, status=status.HTTP_200_OK)


class HolidayViewSet(viewsets.ModelViewSet):
    queryset = Holiday.objects.all()
    serializer_class = HolidaySerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        if not is_hr_or_admin(self.request.user):
            raise permissions.PermissionDenied("Only Admin/HR can add holidays.")
        serializer.save()
