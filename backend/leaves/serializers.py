from rest_framework import serializers
from .models import LeaveRequest, LeaveBalance
from .policy import policy_snapshot

class LeaveApplySerializer(serializers.Serializer):
    leave_type = serializers.ChoiceField(
        choices=['casual', 'sick', 'earned', 'exam', 'college', 'other']
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
    joining_date = serializers.SerializerMethodField()
    joining_month = serializers.SerializerMethodField()
    joining_month_name = serializers.SerializerMethodField()
    is_joining_year = serializers.SerializerMethodField()
    policy_note = serializers.SerializerMethodField()

    def _snapshot(self, obj):
        cached = getattr(obj, '_policy_snapshot', None)
        if cached is None:
            cached = policy_snapshot(obj.employee, year=obj.year, pl_carried_forward=obj.pl_carried_forward)
            obj._policy_snapshot = cached
        return cached

    def get_casual_remaining(self, obj):
        return obj.casual_total - obj.casual_used

    def get_sick_remaining(self, obj):
        return obj.sick_total - obj.sick_used

    def get_earned_remaining(self, obj):
        return obj.earned_total - obj.earned_used

    def get_joining_date(self, obj):
        return self._snapshot(obj)['joining_date']

    def get_joining_month(self, obj):
        return self._snapshot(obj)['joining_month']

    def get_joining_month_name(self, obj):
        return self._snapshot(obj)['joining_month_name']

    def get_is_joining_year(self, obj):
        return self._snapshot(obj)['is_joining_year']

    def get_policy_note(self, obj):
        snap = self._snapshot(obj)
        if snap['is_joining_year']:
            return (
                f"Joined in {snap['joining_month_name']}: "
                f"{int(snap['casual_total'])} CL + {int(snap['sick_total'])} SL + "
                f"{int(snap['pl_base'])} PL for {snap['year']}."
            )
        carried = snap['pl_carried_forward']
        extra = f" Unused PL of {carried} day(s) carried forward." if carried else ""
        return (
            f"Full-year entitlement: 10 CL + 10 SL + 15 PL.{extra}"
        )

    class Meta:
        model = LeaveBalance
        fields = [
            'year',
            'casual_total', 'casual_used', 'casual_remaining',
            'sick_total', 'sick_used', 'sick_remaining',
            'earned_total', 'earned_used', 'earned_remaining',
            'pl_carried_forward',
            'joining_date', 'joining_month', 'joining_month_name',
            'is_joining_year', 'policy_note',
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