from rest_framework import serializers
from .models import TrainingProgram, TrainingEnrollment


class TrainingProgramSerializer(serializers.ModelSerializer):
    created_by_name = serializers.ReadOnlyField(source='created_by.name')
    enrolled_count = serializers.IntegerField(source='enrollments.count', read_only=True)
    current_participants = serializers.IntegerField(source='enrollments.count', read_only=True)
    start_date = serializers.DateField(source='scheduled_date', required=False)
    duration_days = serializers.FloatField(source='duration_hours', required=False)
    is_enrolled = serializers.SerializerMethodField()

    class Meta:
        model = TrainingProgram
        fields = [
            'id', 'title', 'description', 'trainer_name', 'mode', 'scheduled_date',
            'start_date', 'duration_hours', 'duration_days', 'target_department',
            'created_by', 'created_by_name', 'max_participants', 'enrolled_count',
            'current_participants', 'is_enrolled'
        ]
        read_only_fields = ['created_by']
        extra_kwargs = {
            'scheduled_date': {'required': False},
            'duration_hours': {'required': False},
            'trainer_name': {'required': False, 'allow_blank': True},
        }

    def get_is_enrolled(self, obj):
        request = self.context.get('request')
        if not request or not request.user or not request.user.is_authenticated:
            return False
        emp = getattr(request.user, 'employee', None) or getattr(request, 'employee', None)
        if not emp:
            return False
        return obj.enrollments.filter(employee=emp).exists()

    def validate(self, attrs):
        if 'scheduled_date' not in attrs and 'start_date' in attrs:
            attrs['scheduled_date'] = attrs.pop('start_date')
        if 'duration_hours' not in attrs and 'duration_days' in attrs:
            attrs['duration_hours'] = attrs.pop('duration_days')

        if 'scheduled_date' not in attrs:
            raise serializers.ValidationError({'scheduled_date': 'Scheduled date is required.'})
        if 'duration_hours' not in attrs:
            raise serializers.ValidationError({'duration_hours': 'Duration is required.'})
        if not attrs.get('trainer_name'):
            attrs['trainer_name'] = 'Staff Trainer'

        return attrs


class TrainingEnrollmentSerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.name')
    program_title = serializers.ReadOnlyField(source='program.title')
    scheduled_date = serializers.ReadOnlyField(source='program.scheduled_date')

    class Meta:
        model = TrainingEnrollment
        fields = [
            'id', 'program', 'program_title', 'scheduled_date',
            'employee', 'employee_name', 'attended', 'feedback_rating',
            'feedback_comment', 'enrolled_on'
        ]
        read_only_fields = ['attended', 'enrolled_on']
