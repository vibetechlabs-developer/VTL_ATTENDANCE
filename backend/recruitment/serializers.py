from rest_framework import serializers
from .models import JobOpening, Candidate, Application, Interview
from users.models import Employee


class JobOpeningSerializer(serializers.ModelSerializer):
    posted_by_name = serializers.ReadOnlyField(source='posted_by.name')

    class Meta:
        model = JobOpening
        fields = [
            'id', 'title', 'department', 'location',
            'experience_required', 'description', 'status',
            'posted_by', 'posted_by_name', 'posted_on', 'closing_date'
        ]
        read_only_fields = ['posted_by', 'posted_on']


class CandidateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Candidate
        fields = ['id', 'name', 'email', 'phone', 'resume', 'source', 'created_on']
        read_only_fields = ['created_on']


class ApplicationSerializer(serializers.ModelSerializer):
    candidate_detail = CandidateSerializer(source='candidate', read_only=True)
    job_title = serializers.ReadOnlyField(source='job_opening.title')
    job_department = serializers.ReadOnlyField(source='job_opening.department')

    class Meta:
        model = Application
        fields = [
            'id', 'job_opening', 'job_title', 'job_department',
            'candidate', 'candidate_detail', 'stage',
            'applied_on', 'updated_on'
        ]
        read_only_fields = ['applied_on', 'updated_on']


class PanelMemberSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employee
        fields = ['id', 'name', 'department']


class InterviewSerializer(serializers.ModelSerializer):
    panel_members_details = PanelMemberSerializer(source='panel_members', many=True, read_only=True)
    candidate_name = serializers.ReadOnlyField(source='application.candidate.name')
    job_title = serializers.ReadOnlyField(source='application.job_opening.title')

    class Meta:
        model = Interview
        fields = [
            'id', 'application', 'candidate_name', 'job_title',
            'scheduled_on', 'mode', 'panel_members',
            'panel_members_details', 'status', 'feedback', 'rating'
        ]
        read_only_fields = ['feedback', 'rating']
