from rest_framework import serializers
from .models import LeaveType, LeaveBalance, LeaveApplication, Holiday


class LeaveTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveType
        fields = ['id', 'name', 'code', 'annual_quota', 'accrual_frequency', 'carry_forward_limit', 'requires_approval']


class LeaveBalanceSerializer(serializers.ModelSerializer):
    leave_type_code = serializers.ReadOnlyField(source='leave_type.code')
    leave_type_name = serializers.ReadOnlyField(source='leave_type.name')
    balance = serializers.ReadOnlyField()

    class Meta:
        model = LeaveBalance
        fields = ['id', 'employee', 'leave_type', 'leave_type_code', 'leave_type_name', 'year', 'allocated', 'used', 'balance']
        read_only_fields = ['allocated', 'used', 'balance']


class LeaveApplicationSerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.name')
    leave_type_code = serializers.ReadOnlyField(source='leave_type.code')
    approved_by_name = serializers.ReadOnlyField(source='approved_by.name')

    class Meta:
        model = LeaveApplication
        fields = [
            'id', 'employee', 'employee_name', 'leave_type', 'leave_type_code',
            'start_date', 'end_date', 'number_of_days', 'reason', 'status',
            'applied_on', 'approved_by', 'approved_by_name', 'approved_on', 'manager_remark'
        ]
        read_only_fields = ['employee', 'status', 'applied_on', 'approved_by', 'approved_on', 'manager_remark']


class HolidaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Holiday
        fields = ['id', 'name', 'date', 'location']
