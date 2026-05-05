from rest_framework import serializers
from .models import DailyUpdate

class DailyUpdateSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.name', read_only=True)
    role = serializers.CharField(source='employee.user.role', read_only=True)

    class Meta:
        model = DailyUpdate
        fields = ['id', 'date', 'update_text', 'created_at', 'employee_name', 'role']