from datetime import timedelta
from django.utils import timezone
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import (
    Resignation,
    ClearanceChecklistItem,
    ExitInterview,
    DEFAULT_NOTICE_PERIOD_DAYS,
    DEFAULT_CLEARANCE_ITEMS
)
from .serializers import (
    ResignationSerializer,
    ClearanceChecklistItemSerializer,
    ExitInterviewSerializer
)
from users.models import Employee
from leave.models import LeaveBalance
from payroll.models import Payslip


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


class ResignationViewSet(viewsets.ModelViewSet):
    queryset = Resignation.objects.all()
    serializer_class = ResignationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = Resignation.objects.all()
        scope = self.request.query_params.get('scope')
        current_emp = get_employee(self.request)

        if scope == 'mine' and current_emp:
            qs = qs.filter(employee=current_emp)
        elif not is_hr_or_admin(self.request.user) and current_emp:
            qs = qs.filter(employee=current_emp)

        return qs

    def create(self, request, *args, **kwargs):
        current_emp = get_employee(request)
        if not current_emp:
            return Response({'error': 'Employee profile required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Check existing active resignation
        existing = Resignation.objects.filter(employee=current_emp).exclude(status='withdrawn').first()
        if existing:
            return Response(
                {'error': f'You already have an active resignation (Status: {existing.status}).'},
                status=status.HTTP_400_BAD_REQUEST
            )

        notice_days = request.data.get('notice_period_days', DEFAULT_NOTICE_PERIOD_DAYS)
        try:
            notice_days = int(notice_days)
        except (ValueError, TypeError):
            notice_days = DEFAULT_NOTICE_PERIOD_DAYS

        today = timezone.now().date()
        proposed_last_day = today + timedelta(days=notice_days)
        reason = request.data.get('reason', '')

        resignation = Resignation.objects.create(
            employee=current_emp,
            notice_period_days=notice_days,
            proposed_last_working_day=proposed_last_day,
            status='submitted',
            reason=reason
        )

        # Auto-generate standard set of ClearanceChecklistItem rows
        for dept, desc in DEFAULT_CLEARANCE_ITEMS:
            ClearanceChecklistItem.objects.create(
                resignation=resignation,
                department=dept,
                item_description=desc,
                status='pending'
            )

        return Response(ResignationSerializer(resignation).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def acknowledge(self, request, pk=None):
        resignation = self.get_object()
        if not is_manager_of(request.user, resignation.employee) and not is_hr_or_admin(request.user):
            return Response({'error': 'Only employee manager or HR/Admin can acknowledge resignation.'}, status=status.HTTP_403_FORBIDDEN)

        approved_last_day = request.data.get('approved_last_working_day')
        if approved_last_day:
            resignation.approved_last_working_day = approved_last_day
        else:
            resignation.approved_last_working_day = resignation.proposed_last_working_day

        resignation.status = 'acknowledged'
        resignation.save()

        return Response(ResignationSerializer(resignation).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def withdraw(self, request, pk=None):
        resignation = self.get_object()
        current_emp = get_employee(request)

        if current_emp != resignation.employee and not is_hr_or_admin(request.user):
            return Response({'error': 'Only the employee can withdraw their resignation.'}, status=status.HTTP_403_FORBIDDEN)

        if resignation.status != 'submitted':
            return Response({'error': f'Resignation cannot be withdrawn when status is {resignation.status}.'}, status=status.HTTP_400_BAD_REQUEST)

        resignation.status = 'withdrawn'
        resignation.save()

        return Response(ResignationSerializer(resignation).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        if not is_hr_or_admin(request.user):
            return Response({'error': 'Only HR/Admin can mark a resignation as completed.'}, status=status.HTTP_403_FORBIDDEN)

        resignation = self.get_object()

        # Check if all clearance items are 'done'
        pending_items = resignation.clearance_items.filter(status='pending')
        if pending_items.exists():
            return Response(
                {
                    'error': 'Cannot complete exit: pending clearance checklist items exist.',
                    'pending_items': list(pending_items.values_list('item_description', flat=True))
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        resignation.status = 'completed'
        resignation.save()

        # Set employee employment_status = 'exited' if field exists
        emp = resignation.employee
        if hasattr(emp, 'employment_status'):
            setattr(emp, 'employment_status', 'exited')
            emp.save()

        return Response(ResignationSerializer(resignation).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'])
    def ffs_summary(self, request, pk=None):
        resignation = self.get_object()
        emp = resignation.employee
        current_year = timezone.now().year

        # 1. Leave Encashment Preview from 'leave' app
        balances = LeaveBalance.objects.filter(employee=emp, year=current_year)
        leave_encashment_summary = [
            {
                'leave_type': b.leave_type.code,
                'leave_type_name': b.leave_type.name,
                'remaining_balance': float(b.balance)
            }
            for b in balances
        ]
        total_remaining_leave_days = sum([float(b.balance) for b in balances])

        # 2. Last Payroll Run data from 'payroll' app
        last_payslip = Payslip.objects.filter(employee=emp).select_related('payroll_run').order_by('-payroll_run__year', '-payroll_run__month').first()
        last_payroll_data = None
        if last_payslip:
            last_payroll_data = {
                'month': last_payslip.payroll_run.month,
                'year': last_payslip.payroll_run.year,
                'gross_earnings': float(last_payslip.gross_earnings),
                'total_deductions': float(last_payslip.total_deductions),
                'net_pay': float(last_payslip.net_pay),
                'lop_days': float(last_payslip.lop_days)
            }

        # 3. Clearance status summary
        total_clearance = resignation.clearance_items.count()
        done_clearance = resignation.clearance_items.filter(status='done').count()

        return Response({
            'resignation_id': resignation.id,
            'employee': {
                'id': emp.id,
                'name': emp.name,
                'department': emp.department,
                'employee_code': getattr(emp, 'employee_code', None),
                'date_of_joining': str(getattr(emp, 'date_of_joining', ''))
            },
            'resignation_status': resignation.status,
            'submitted_on': str(resignation.submitted_on),
            'notice_period_days': resignation.notice_period_days,
            'proposed_last_working_day': str(resignation.proposed_last_working_day),
            'approved_last_working_day': str(resignation.approved_last_working_day) if resignation.approved_last_working_day else None,
            'leave_encashment_preview': {
                'total_remaining_days': total_remaining_leave_days,
                'breakdown': leave_encashment_summary
            },
            'last_payroll_preview': last_payroll_data,
            'clearance_status': {
                'total_items': total_clearance,
                'done_items': done_clearance,
                'all_cleared': (total_clearance > 0 and total_clearance == done_clearance)
            }
        })


class ClearanceChecklistItemViewSet(viewsets.ModelViewSet):
    queryset = ClearanceChecklistItem.objects.select_related('resignation', 'cleared_by').all()
    serializer_class = ClearanceChecklistItemSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = ClearanceChecklistItem.objects.select_related('resignation', 'cleared_by').all()
        resignation_id = self.request.query_params.get('resignation')
        if resignation_id:
            qs = qs.filter(resignation_id=resignation_id)
        return qs

    @action(detail=True, methods=['post'])
    def mark_done(self, request, pk=None):
        item = self.get_object()
        current_emp = get_employee(request)

        if not is_hr_or_admin(request.user) and not is_manager_of(request.user, item.resignation.employee):
            return Response({'error': 'Only HR/Admin or manager can mark clearance item as done.'}, status=status.HTTP_403_FORBIDDEN)

        item.status = 'done'
        item.remark = request.data.get('remark', '')
        item.cleared_by = current_emp
        item.cleared_on = timezone.now()
        item.save()

        return Response(ClearanceChecklistItemSerializer(item).data, status=status.HTTP_200_OK)


class ExitInterviewViewSet(viewsets.ModelViewSet):
    queryset = ExitInterview.objects.select_related('resignation', 'conducted_by').all()
    serializer_class = ExitInterviewSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        current_emp = get_employee(self.request)
        serializer.save(conducted_by=current_emp)
