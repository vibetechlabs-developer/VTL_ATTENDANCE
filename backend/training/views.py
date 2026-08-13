from django.utils import timezone
from django.db.models import Avg, Q
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import TrainingProgram, TrainingEnrollment
from .serializers import TrainingProgramSerializer, TrainingEnrollmentSerializer
from users.models import Employee


def get_employee(request):
    if not request.user or not request.user.is_authenticated:
        return None
    if hasattr(request.user, 'employee'):
        return request.user.employee
    return getattr(request, 'employee', None)


def is_hr_or_admin(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    if getattr(user, 'role', '') in ['admin', 'hr']:
        return True
    return False


class TrainingProgramViewSet(viewsets.ModelViewSet):
    queryset = TrainingProgram.objects.all()
    serializer_class = TrainingProgramSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = TrainingProgram.objects.all()
        current_emp = get_employee(self.request)

        # Auto-filter by department for regular employees unless blank/all
        if not is_hr_or_admin(self.request.user) and current_emp:
            qs = qs.filter(Q(target_department='') | Q(target_department__iexact=current_emp.department))
        else:
            dept = self.request.query_params.get('department')
            if dept:
                qs = qs.filter(Q(target_department='') | Q(target_department__iexact=dept))

        return qs

    def perform_create(self, serializer):
        if not is_hr_or_admin(self.request.user):
            raise permissions.PermissionDenied("Only HR/Admin can create training programs.")
        current_emp = get_employee(self.request)
        serializer.save(created_by=current_emp)

    def perform_update(self, serializer):
        if not is_hr_or_admin(self.request.user):
            raise permissions.PermissionDenied("Only HR/Admin can update training programs.")
        serializer.save()

    def perform_destroy(self, instance):
        if not is_hr_or_admin(self.request.user):
            raise permissions.PermissionDenied("Only HR/Admin can delete training programs.")
        instance.delete()

    @action(detail=True, methods=['post'])
    def bulk_enroll(self, request, pk=None):
        if not is_hr_or_admin(request.user):
            return Response({'error': 'Only HR/Admin can bulk-enroll employees.'}, status=status.HTTP_403_FORBIDDEN)

        program = self.get_object()
        target_dept = request.data.get('department')

        if not target_dept:
            return Response({'error': 'department is required.'}, status=status.HTTP_400_BAD_REQUEST)

        employees = Employee.objects.filter(department__iexact=target_dept, user__is_active=True)
        enrolled_count = 0
        skipped_count = 0

        for emp in employees:
            if program.max_participants and program.enrollments.count() >= program.max_participants:
                break
            enrollment, created = TrainingEnrollment.objects.get_or_create(
                program=program,
                employee=emp
            )
            if created:
                enrolled_count += 1
            else:
                skipped_count += 1

        return Response(
            {
                'message': f'Bulk enrollment completed for {target_dept}.',
                'enrolled_new': enrolled_count,
                'already_enrolled': skipped_count,
                'total_enrolled': program.enrollments.count()
            },
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['get'])
    def summary(self, request, pk=None):
        program = self.get_object()
        enrollments = program.enrollments.all()

        enrolled_count = enrollments.count()
        attended_count = enrollments.filter(attended=True).count()
        avg_rating = enrollments.aggregate(avg=Avg('feedback_rating'))['avg']

        return Response({
            'program_id': program.id,
            'title': program.title,
            'enrolled_count': enrolled_count,
            'attended_count': attended_count,
            'average_feedback_rating': round(avg_rating, 2) if avg_rating else None
        })


class TrainingEnrollmentViewSet(viewsets.ModelViewSet):
    queryset = TrainingEnrollment.objects.select_related('program', 'employee').all()
    serializer_class = TrainingEnrollmentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = TrainingEnrollment.objects.select_related('program', 'employee').all()
        scope = self.request.query_params.get('scope')
        program_id = self.request.query_params.get('program_id')

        current_emp = get_employee(self.request)
        if scope == 'mine' and current_emp:
            qs = qs.filter(employee=current_emp)
        elif not is_hr_or_admin(self.request.user) and current_emp:
            qs = qs.filter(employee=current_emp)

        if program_id:
            qs = qs.filter(program_id=program_id)

        return qs

    def create(self, request, *args, **kwargs):
        current_emp = get_employee(request)
        program_id = request.data.get('program')

        if not current_emp:
            return Response({'error': 'Employee profile required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            program = TrainingProgram.objects.get(id=program_id)
        except TrainingProgram.DoesNotExist:
            return Response({'error': 'TrainingProgram not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Check max_participants capacity limit
        if program.max_participants and program.enrollments.count() >= program.max_participants:
            return Response(
                {'error': f'Enrollment limit reached ({program.max_participants} max participants).'},
                status=status.HTTP_400_BAD_REQUEST
            )

        enrollment, created = TrainingEnrollment.objects.get_or_create(
            program=program,
            employee=current_emp
        )
        if not created:
            return Response({'error': 'You are already enrolled in this training program.'}, status=status.HTTP_400_BAD_REQUEST)

        return Response(TrainingEnrollmentSerializer(enrollment).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def mark_attended(self, request, pk=None):
        enrollment = self.get_object()
        current_emp = get_employee(request)

        # Authorized if HR/admin or program creator
        is_creator = current_emp and enrollment.program.created_by == current_emp
        if not is_hr_or_admin(request.user) and not is_creator:
            return Response({'error': 'Only HR/Admin or program creator can mark attendance.'}, status=status.HTTP_403_FORBIDDEN)

        # Check if scheduled_date has passed
        if timezone.now().date() < enrollment.program.scheduled_date:
            return Response({'error': 'Attendance cannot be marked before the program scheduled date.'}, status=status.HTTP_400_BAD_REQUEST)

        enrollment.attended = True
        enrollment.save()

        return Response(TrainingEnrollmentSerializer(enrollment).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def submit_feedback(self, request, pk=None):
        enrollment = self.get_object()
        current_emp = get_employee(request)

        if current_emp != enrollment.employee and not is_hr_or_admin(request.user):
            return Response({'error': 'Only the enrolled employee can submit feedback.'}, status=status.HTTP_403_FORBIDDEN)

        if not enrollment.attended:
            return Response({'error': 'Feedback can only be submitted after attendance is marked.'}, status=status.HTTP_400_BAD_REQUEST)

        if timezone.now().date() < enrollment.program.scheduled_date:
            return Response({'error': 'Feedback cannot be submitted before scheduled date.'}, status=status.HTTP_400_BAD_REQUEST)

        rating = request.data.get('feedback_rating')
        comment = request.data.get('feedback_comment', '')

        if rating is not None:
            try:
                rating = int(rating)
                if not (1 <= rating <= 5):
                    raise ValueError
            except (ValueError, TypeError):
                return Response({'error': 'feedback_rating must be an integer between 1 and 5.'}, status=status.HTTP_400_BAD_REQUEST)

        enrollment.feedback_rating = rating
        enrollment.feedback_comment = comment
        enrollment.save()

        return Response(TrainingEnrollmentSerializer(enrollment).data, status=status.HTTP_200_OK)
