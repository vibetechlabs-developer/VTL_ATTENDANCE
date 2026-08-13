from rest_framework import serializers
from .models import AppraisalCycle, Goal, Appraisal
from users.models import Employee


class AppraisalCycleSerializer(serializers.ModelSerializer):
    target_employee_ids = serializers.PrimaryKeyRelatedField(
        queryset=Employee.objects.all(),
        many=True,
        source='target_employees',
        required=False
    )
    target_employee_names = serializers.SerializerMethodField()

    class Meta:
        model = AppraisalCycle
        fields = [
            'id', 'name', 'description', 'start_date', 'end_date', 'status',
            'target_type', 'target_department', 'target_employee_ids', 'target_employee_names',
            'created_at'
        ]

    def get_target_employee_names(self, obj):
        return list(obj.target_employees.values_list('name', flat=True))


class GoalSerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.name')
    cycle_name = serializers.ReadOnlyField(source='cycle.name')

    class Meta:
        model = Goal
        fields = [
            'id', 'cycle', 'cycle_name', 'employee', 'employee_name',
            'title', 'description', 'target_metric', 'weightage',
            'self_rating', 'self_comment', 'manager_rating', 'manager_comment'
        ]


class AppraisalSerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.name')
    employee_designation = serializers.ReadOnlyField(source='employee.designation')
    employee_department = serializers.ReadOnlyField(source='employee.department')
    cycle_name = serializers.ReadOnlyField(source='cycle.name')
    finalized_by_name = serializers.ReadOnlyField(source='finalized_by.name')
    goals = GoalSerializer(many=True, read_only=True, source='employee.performance_goals')

    class Meta:
        model = Appraisal
        fields = [
            'id', 'cycle', 'cycle_name', 'employee', 'employee_name',
            'employee_designation', 'employee_department',
            'overall_rating', 'status',
            'punctuality_rating', 'punctuality_comment',
            'quality_rating', 'quality_comment',
            'productivity_rating', 'productivity_comment',
            'teamwork_rating', 'teamwork_comment',
            'initiative_rating', 'initiative_comment',
            'manager_notes', 'employee_notes',
            'finalized_by', 'finalized_by_name',
            'finalized_on', 'goals'
        ]
        read_only_fields = ['overall_rating', 'status', 'finalized_by', 'finalized_on']
