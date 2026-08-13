from rest_framework import serializers
from .models import Resignation, ClearanceChecklistItem, ExitInterview


class ClearanceChecklistItemSerializer(serializers.ModelSerializer):
    cleared_by_name = serializers.ReadOnlyField(source='cleared_by.name')

    class Meta:
        model = ClearanceChecklistItem
        fields = [
            'id', 'resignation', 'department', 'item_description',
            'status', 'remark', 'cleared_by', 'cleared_by_name', 'cleared_on'
        ]
        read_only_fields = ['resignation', 'status', 'cleared_by', 'cleared_on']


class ExitInterviewSerializer(serializers.ModelSerializer):
    conducted_by_name = serializers.ReadOnlyField(source='conducted_by.name')
    employee_name = serializers.ReadOnlyField(source='resignation.employee.name')

    class Meta:
        model = ExitInterview
        fields = [
            'id', 'resignation', 'employee_name', 'conducted_by',
            'conducted_by_name', 'conducted_on', 'reason_for_leaving',
            'satisfaction_score', 'comments'
        ]
        read_only_fields = ['conducted_by']


class ResignationSerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.name')
    clearance_items = ClearanceChecklistItemSerializer(many=True, read_only=True)
    exit_interview = ExitInterviewSerializer(read_only=True)

    class Meta:
        model = Resignation
        fields = [
            'id', 'employee', 'employee_name', 'submitted_on',
            'notice_period_days', 'proposed_last_working_day',
            'approved_last_working_day', 'status', 'reason',
            'clearance_items', 'exit_interview'
        ]
        read_only_fields = ['employee', 'submitted_on', 'proposed_last_working_day', 'status']
