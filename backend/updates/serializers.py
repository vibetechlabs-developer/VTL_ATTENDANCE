from rest_framework import serializers
from .models import DailyUpdate, Task
from users.models import Employee


class DailyUpdateSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.name', read_only=True)
    employee_id = serializers.IntegerField(source='employee.id', read_only=True)
    user_id = serializers.IntegerField(source='employee.user.id', read_only=True)
    role = serializers.CharField(source='employee.user.role', read_only=True)

    class Meta:
        model = DailyUpdate
        fields = ['id', 'employee_id', 'user_id', 'date', 'update_text', 'report_data', 'created_at', 'employee_name', 'role']


class TaskSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.CharField(source='assigned_to.name', read_only=True)
    assigned_to_email = serializers.CharField(source='assigned_to.user.email', read_only=True)
    assigned_to_department = serializers.CharField(source='assigned_to.department', read_only=True)
    assigned_by_name = serializers.CharField(source='assigned_by.username', read_only=True)
    assigned_by_email = serializers.CharField(source='assigned_by.email', read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = Task
        fields = [
            'id',
            'title',
            'description',
            'assigned_to',
            'assigned_to_name',
            'assigned_to_email',
            'assigned_to_department',
            'assigned_by',
            'assigned_by_name',
            'assigned_by_email',
            'priority',
            'status',
            'due_datetime',
            'completion_notes',
            'completed_at',
            'is_overdue',
            'created_at',
            'updated_at',
        ]

        read_only_fields = ['assigned_by', 'completed_at', 'created_at', 'updated_at']