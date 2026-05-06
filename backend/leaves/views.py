from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import LeaveRequest, LeaveBalance
from .serializers import (
    LeaveApplySerializer,
    LeaveBalanceSerializer,
    LeaveRequestSerializer
)
from users.models import Employee
from users.models import AppNotification
from decimal import Decimal


# ─── Leave Apply ───────────────────────────────────────
class LeaveApplyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = LeaveApplySerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)

        data = serializer.validated_data
        employee = request.user.employee

        # Total days calculate karo
        is_half_day = data.get('is_half_day', False)
        if is_half_day:
            days = Decimal('0.5')
        else:
            delta = data['end_date'] - data['start_date']
            days = Decimal(delta.days + 1)

        # Balance check karo
        balance = LeaveBalance.objects.get(employee=employee)
        leave_type = data['leave_type']

        if leave_type == 'casual':
            remaining = balance.casual_total - balance.casual_used
        elif leave_type == 'sick':
            remaining = balance.sick_total - balance.sick_used
        else:
            remaining = balance.earned_total - balance.earned_used

        if days > remaining:
            return Response(
                {'error': f'Only {remaining} day(s) remaining for this leave type.'},
                status=400
            )

        # Leave create karo
        leave = LeaveRequest.objects.create(
            employee=employee,
            leave_type=leave_type,
            start_date=data['start_date'],
            end_date=data['end_date'],
            is_half_day=is_half_day,
            reason=data['reason'],
            status='pending'
        )

        return Response({
            'message': 'Leave request submitted.',
            'leave_id': leave.id,
            'days': days,
            'status': 'pending'
        })


# ─── Leave Approve ─────────────────────────────────────
class LeaveApproveView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        # Sirf admin ya manager j approve kari shake
        if request.user.role not in ['admin', 'manager']:
            return Response(
                {'error': 'Permission denied.'},
                status=403
            )

        try:
            leave = LeaveRequest.objects.get(pk=pk)
        except LeaveRequest.DoesNotExist:
            return Response({'error': 'Leave request not found.'}, status=404)

        if leave.status != 'pending':
            return Response(
                {'error': 'This leave request has already been processed.'},
                status=400
            )

        # Approve karo
        leave.status = 'approved'
        leave.reviewed_by = request.user
        leave.save()

        # Balance update karo
        if leave.is_half_day:
            days = Decimal('0.5')
        else:
            delta = leave.end_date - leave.start_date
            days = Decimal(delta.days + 1)
        balance = LeaveBalance.objects.get(employee=leave.employee)

        if leave.leave_type == 'casual':
            balance.casual_used += days
        elif leave.leave_type == 'sick':
            balance.sick_used += days
        else:
            balance.earned_used += days

        balance.save()

        AppNotification.objects.create(
            user=leave.employee.user,
            title='Leave approved',
            body=f'Your {leave.leave_type} leave ({leave.start_date} to {leave.end_date}) has been approved.',
            type='success',
        )

        return Response({
            'message': 'Leave approved.',
            'days_deducted': float(days)
        })


# ─── Leave Reject ──────────────────────────────────────
class LeaveRejectView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if request.user.role not in ['admin', 'manager']:
            return Response(
                {'error': 'Permission denied.'},
                status=403
            )

        try:
            leave = LeaveRequest.objects.get(pk=pk)
        except LeaveRequest.DoesNotExist:
            return Response({'error': 'Leave request not found.'}, status=404)

        leave.status = 'rejected'
        leave.reviewed_by = request.user
        leave.save()

        AppNotification.objects.create(
            user=leave.employee.user,
            title='Leave rejected',
            body=f'Your {leave.leave_type} leave ({leave.start_date} to {leave.end_date}) has been rejected.',
            type='warning',
        )

        return Response({'message': 'Leave rejected.'})


# ─── Leave Balance ─────────────────────────────────────
class LeaveBalanceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        balance, _ = LeaveBalance.objects.get_or_create(
            employee=request.user.employee
        )
        serializer = LeaveBalanceSerializer(balance)
        return Response(serializer.data)


# ─── Leave History ─────────────────────────────────────
class LeaveHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        leaves = LeaveRequest.objects.filter(
            employee=request.user.employee
        ).order_by('-applied_at')

        serializer = LeaveRequestSerializer(leaves, many=True)
        return Response(serializer.data)


# ─── All Pending Leaves (Admin/Manager) ────────────────
class PendingLeavesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in ['admin', 'manager', 'hr']:
            return Response({'error': 'Permission denied.'}, status=403)

        leaves = LeaveRequest.objects.filter(
            status='pending'
        ).order_by('-applied_at')

        serializer = LeaveRequestSerializer(leaves, many=True)
        return Response(serializer.data)


class LeaveUsageSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in ['admin', 'hr']:
            return Response({'error': 'Permission denied.'}, status=403)

        employees = Employee.objects.select_related('user').all().order_by('name')
        summary = {
            emp.id: {
                'employee_id': emp.id,
                'employee_name': emp.name,
                'approved_requests': 0,
                'pending_requests': 0,
                'rejected_requests': 0,
                'approved_days': 0,
                'pending_days': 0,
                'total_requests': 0,
                'casual_days': 0,
                'sick_days': 0,
                'earned_days': 0,
                'casual_total': 0,
                'sick_total': 0,
                'earned_total': 0,
                'casual_used': 0,
                'sick_used': 0,
                'earned_used': 0,
                'total_entitled': 0,
                'total_used': 0,
                'total_remaining': 0,
            }
            for emp in employees
        }

        balances = {
            b.employee_id: b
            for b in LeaveBalance.objects.filter(employee_id__in=summary.keys())
        }
        for emp_id, row in summary.items():
            bal = balances.get(emp_id)
            if bal:
                row['casual_total'] = bal.casual_total
                row['sick_total'] = bal.sick_total
                row['earned_total'] = bal.earned_total
                row['casual_used'] = bal.casual_used
                row['sick_used'] = bal.sick_used
                row['earned_used'] = bal.earned_used
                row['total_entitled'] = bal.casual_total + bal.sick_total + bal.earned_total
                row['total_used'] = bal.casual_used + bal.sick_used + bal.earned_used
                row['total_remaining'] = row['total_entitled'] - row['total_used']
            else:
                row['total_entitled'] = 12 + 10 + 15
                row['total_used'] = row['casual_used'] + row['sick_used'] + row['earned_used']
                row['total_remaining'] = row['total_entitled'] - row['total_used']

        leaves = LeaveRequest.objects.select_related('employee__user').all()
        for leave in leaves:
            row = summary.get(leave.employee_id)
            if not row:
                continue
            days = Decimal('0.5') if leave.is_half_day else Decimal((leave.end_date - leave.start_date).days + 1)
            row['total_requests'] += 1
            if leave.status == 'approved':
                row['approved_requests'] += 1
                row['approved_days'] += days
                if leave.leave_type == 'casual':
                    row['casual_days'] += days
                elif leave.leave_type == 'sick':
                    row['sick_days'] += days
                else:
                    row['earned_days'] += days
            elif leave.status == 'pending':
                row['pending_requests'] += 1
                row['pending_days'] += days
            elif leave.status == 'rejected':
                row['rejected_requests'] += 1

        rows = sorted(
            summary.values(),
            key=lambda r: (r['approved_days'], r['pending_requests'], r['total_requests']),
            reverse=True
        )

        # Keep payload JSON-safe across renderers (some fail on Decimal).
        decimal_fields = {
            'approved_days', 'pending_days', 'casual_days', 'sick_days', 'earned_days',
            'casual_total', 'sick_total', 'earned_total', 'casual_used', 'sick_used',
            'earned_used', 'total_entitled', 'total_used', 'total_remaining'
        }
        normalized_rows = []
        for row in rows:
            out = dict(row)
            for key in decimal_fields:
                val = out.get(key, 0)
                out[key] = float(val) if val is not None else 0.0
            normalized_rows.append(out)

        return Response(normalized_rows)