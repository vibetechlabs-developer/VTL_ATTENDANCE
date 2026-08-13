from django.utils import timezone
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from .models import JobOpening, Candidate, Application, Interview
from .serializers import (
    JobOpeningSerializer,
    CandidateSerializer,
    ApplicationSerializer,
    InterviewSerializer
)
from users.models import Employee


def get_employee(request):
    """Helper function to obtain the Employee instance associated with request.user."""
    if not request.user or not request.user.is_authenticated:
        return None
    if hasattr(request.user, 'employee'):
        return request.user.employee
    return getattr(request, 'employee', None)


def is_hr_or_admin(user):
    """Helper to check if a user is an HR/admin role."""
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    if getattr(user, 'role', '') in ['admin', 'hr']:
        return True
    return False


class JobOpeningViewSet(viewsets.ModelViewSet):
    queryset = JobOpening.objects.all()
    serializer_class = JobOpeningSerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        qs = JobOpening.objects.all()
        # If unauthenticated, only return open jobs for careers page
        if not self.request.user or not self.request.user.is_authenticated:
            return qs.filter(status='open')
        
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        return qs

    def perform_create(self, serializer):
        emp = get_employee(self.request)
        if not is_hr_or_admin(self.request.user):
            # Non-HR employees cannot post jobs unless authorized
            pass
        serializer.save(posted_by=emp)

    def update(self, request, *args, **kwargs):
        job = self.get_object()
        emp = get_employee(request)
        if not is_hr_or_admin(request.user) and (not emp or job.posted_by != emp):
            return Response(
                {'detail': 'Only the poster or HR/admin can edit/close this job opening.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        job = self.get_object()
        emp = get_employee(request)
        if not is_hr_or_admin(request.user) and (not emp or job.posted_by != emp):
            return Response(
                {'detail': 'Only the poster or HR/admin can delete this job opening.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().destroy(request, *args, **kwargs)


class CandidateViewSet(viewsets.ModelViewSet):
    queryset = Candidate.objects.all()
    serializer_class = CandidateSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Candidate.objects.all()


class ApplicationViewSet(viewsets.ModelViewSet):
    queryset = Application.objects.all()
    serializer_class = ApplicationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = Application.objects.all()
        job_id = self.request.query_params.get('job_opening')
        stage = self.request.query_params.get('stage')
        if job_id:
            qs = qs.filter(job_opening_id=job_id)
        if stage:
            qs = qs.filter(stage=stage)
        return qs

    @action(detail=True, methods=['post'])
    def move_stage(self, request, pk=None):
        application = self.get_object()
        new_stage = request.data.get('stage')
        valid_stages = [choice[0] for choice in Application.STAGE_CHOICES]
        
        if not new_stage or new_stage not in valid_stages:
            return Response(
                {'error': f'Invalid stage. Must be one of: {", ".join(valid_stages)}'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        application.stage = new_stage
        application.save()
        return Response(
            ApplicationSerializer(application).data,
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def convert_to_employee(self, request, pk=None):
        application = self.get_object()
        candidate = application.candidate
        job = application.job_opening

        payload = {
            'name': candidate.name,
            'email': candidate.email,
            'phone': candidate.phone,
            'department': job.department,
            'designation': job.title,
            'employment_status': 'active',
            'grade': 'A1',
            'note': f'Candidate pre-formatted from ATS application #{application.id}'
        }
        return Response(
            {
                'message': 'Candidate data formatted for Employee creation.',
                'employee_payload': payload
            },
            status=status.HTTP_200_OK
        )


class InterviewViewSet(viewsets.ModelViewSet):
    queryset = Interview.objects.all()
    serializer_class = InterviewSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        interview = serializer.save()
        # TODO: notify panel members (email / push notification hook)

    @action(detail=True, methods=['post'])
    def submit_feedback(self, request, pk=None):
        interview = self.get_object()
        emp = get_employee(request)

        # Check timezone: scheduled_on must have passed
        if timezone.now() < interview.scheduled_on:
            return Response(
                {'error': 'Feedback cannot be submitted before the scheduled interview time.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check authorization: user must be in panel_members or HR/admin
        is_panel_member = emp and interview.panel_members.filter(id=emp.id).exists()
        if not is_panel_member and not is_hr_or_admin(request.user):
            return Response(
                {'error': 'Only designated panel members or HR/admin can submit interview feedback.'},
                status=status.HTTP_403_FORBIDDEN
            )

        feedback = request.data.get('feedback', '')
        rating = request.data.get('rating')

        if rating is not None:
            try:
                rating = int(rating)
                if not (1 <= rating <= 5):
                    raise ValueError
            except (ValueError, TypeError):
                return Response(
                    {'error': 'Rating must be an integer between 1 and 5.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        interview.feedback = feedback
        if rating is not None:
            interview.rating = rating
        interview.status = 'completed'
        interview.save()

        return Response(
            InterviewSerializer(interview).data,
            status=status.HTTP_200_OK
        )
