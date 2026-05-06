from rest_framework import serializers
from .models import LeaveRequest, LeaveBalance

class LeaveApplySerializer(serializers.Serializer):
    leave_type = serializers.ChoiceField(
        choices=['casual', 'sick', 'earned']
    )
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    reason = serializers.CharField()
    is_half_day = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        if attrs.get('end_date') < attrs.get('start_date'):
            raise serializers.ValidationError("End date cannot be before start date.")
        if attrs.get('is_half_day') and attrs.get('start_date') != attrs.get('end_date'):
            raise serializers.ValidationError("Half-day leave must be for a single day.")
        return attrs

class LeaveBalanceSerializer(serializers.ModelSerializer):
    casual_remaining = serializers.SerializerMethodField()
    sick_remaining = serializers.SerializerMethodField()
    earned_remaining = serializers.SerializerMethodField()

    def get_casual_remaining(self, obj):
        return obj.casual_total - obj.casual_used

    def get_sick_remaining(self, obj):
        return obj.sick_total - obj.sick_used

    def get_earned_remaining(self, obj):
        return obj.earned_total - obj.earned_used

    class Meta:
        model = LeaveBalance
        fields = [
            'casual_total', 'casual_used', 'casual_remaining',
            'sick_total', 'sick_used', 'sick_remaining',
            'earned_total', 'earned_used', 'earned_remaining',
        ]

class LeaveRequestSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(
        source='employee.name', read_only=True
    )

    class Meta:
        model = LeaveRequest
        fields = [
            'id', 'employee_name', 'leave_type',
            'start_date', 'end_date', 'reason',
            'status', 'applied_at', 'is_half_day'
        ]