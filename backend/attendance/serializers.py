from rest_framework import serializers
from .models import AttendanceLog, BreakLog

class CheckInSerializer(serializers.Serializer):
    image = serializers.CharField()   # base64 image
    latitude = serializers.FloatField()
    longitude = serializers.FloatField()


class CheckOutSerializer(serializers.Serializer):
    image = serializers.CharField()   # base64 image
    latitude = serializers.FloatField()
    longitude = serializers.FloatField()

class AttendanceLogSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(
        source='employee.name',
        read_only=True
    )
    class Meta:
        model = AttendanceLog
        fields = [
            'id', 'employee_name', 'date',
            'check_in', 'check_out',
            'total_hours', 'overtime_hours',
            'status'
        ]

class BreakLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = BreakLog
        fields = ['id', 'break_start', 'break_end']