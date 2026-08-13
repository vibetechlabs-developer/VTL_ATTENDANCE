import io
from django.utils import timezone
from django.db.models import Sum
from django.http import HttpResponse
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action, api_view, permission_classes as pc
from rest_framework.response import Response
from .models import AppraisalCycle, Goal, Appraisal
from .serializers import (
    AppraisalCycleSerializer,
    GoalSerializer,
    AppraisalSerializer
)
from users.models import Employee

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

RATING_LABELS = {
    1: "Needs Improvement",
    2: "Below Expectations",
    3: "Meets Expectations",
    4: "Exceeds Expectations",
    5: "Outstanding",
}


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


def is_manager_of(manager_user, employee):
    if not manager_user or not employee:
        return False
    if hasattr(employee, 'manager') and employee.manager and employee.manager == manager_user:
        return True
    if hasattr(employee, 'manager_id') and employee.manager_id == manager_user.id:
        return True
    try:
        if employee.managers.filter(id=manager_user.id).exists():
            return True
    except Exception:
        pass
    return False


def recalculate_appraisal_rating(appraisal):
    """Weighted average: goals (60%) + factor ratings (40%)."""
    goals = Goal.objects.filter(cycle=appraisal.cycle, employee=appraisal.employee)

    goal_score = 0.0
    if goals.exists():
        total_weighted = 0.0
        for goal in goals:
            rating = goal.manager_rating if goal.manager_rating is not None else goal.self_rating
            if rating is not None:
                total_weighted += float(rating) * (float(goal.weightage) / 100.0)
        goal_score = total_weighted

    factors = [
        appraisal.punctuality_rating,
        appraisal.quality_rating,
        appraisal.productivity_rating,
        appraisal.teamwork_rating,
        appraisal.initiative_rating,
    ]
    valid_factors = [f for f in factors if f is not None]

    if valid_factors and goal_score > 0:
        factor_avg = sum(valid_factors) / float(len(valid_factors))
        overall = (goal_score * 0.60) + (factor_avg * 0.40)
    elif valid_factors:
        overall = sum(valid_factors) / float(len(valid_factors))
    else:
        overall = goal_score

    appraisal.overall_rating = round(overall, 2)
    appraisal.save()


# ─── Appraisal Cycle ───────────────────────────────────────────────────────────

class AppraisalCycleViewSet(viewsets.ModelViewSet):
    queryset = AppraisalCycle.objects.all()
    serializer_class = AppraisalCycleSerializer
    permission_classes = [permissions.IsAuthenticated]

    @action(detail=False, methods=['get'])
    def active(self, request):
        cycle = AppraisalCycle.objects.filter(status='active').order_by('-start_date').first()
        if not cycle:
            return Response({'detail': 'No active cycle found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(AppraisalCycleSerializer(cycle).data)

    def perform_create(self, serializer):
        if not is_hr_or_admin(self.request.user):
            raise permissions.PermissionDenied("Only HR/Admin can create appraisal cycles.")
        cycle = serializer.save()

        # Auto-create Appraisal records for target employees
        if cycle.target_type == 'department' and cycle.target_department:
            eligible = Employee.objects.filter(department__iexact=cycle.target_department)
        elif cycle.target_type == 'employees' and cycle.target_employees.exists():
            eligible = cycle.target_employees.all()
        else:
            eligible = Employee.objects.all()

        for emp in eligible:
            Appraisal.objects.get_or_create(cycle=cycle, employee=emp)

    def perform_update(self, serializer):
        if not is_hr_or_admin(self.request.user):
            raise permissions.PermissionDenied("Only HR/Admin can update appraisal cycles.")
        serializer.save()

    def perform_destroy(self, instance):
        if not is_hr_or_admin(self.request.user):
            raise permissions.PermissionDenied("Only HR/Admin can delete appraisal cycles.")
        instance.delete()


# ─── Goals ─────────────────────────────────────────────────────────────────────

class GoalViewSet(viewsets.ModelViewSet):
    queryset = Goal.objects.all()
    serializer_class = GoalSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = Goal.objects.all()
        scope = self.request.query_params.get('scope')
        emp_id = self.request.query_params.get('employee_id')
        cycle_id = self.request.query_params.get('cycle_id')

        current_emp = get_employee(self.request)
        if scope == 'mine' and current_emp:
            qs = qs.filter(employee=current_emp)
        elif emp_id:
            qs = qs.filter(employee_id=emp_id)
        if cycle_id:
            qs = qs.filter(cycle_id=cycle_id)

        return qs

    def perform_create(self, serializer):
        goal = serializer.save()
        appraisal, _ = Appraisal.objects.get_or_create(
            cycle=goal.cycle,
            employee=goal.employee
        )
        recalculate_appraisal_rating(appraisal)

    @action(detail=True, methods=['post'])
    def self_rate(self, request, pk=None):
        """Employee self-rates a goal."""
        goal = self.get_object()
        current_emp = get_employee(request)

        if current_emp != goal.employee and not is_hr_or_admin(request.user):
            return Response({'error': 'You can only self-rate your own goals.'}, status=status.HTTP_403_FORBIDDEN)

        rating = request.data.get('self_rating')
        comment = request.data.get('self_comment', '')

        if rating is not None:
            try:
                rating = int(rating)
                if not (1 <= rating <= 5):
                    raise ValueError
            except (ValueError, TypeError):
                return Response({'error': 'self_rating must be 1–5.'}, status=status.HTTP_400_BAD_REQUEST)

        goal.self_rating = rating
        goal.self_comment = comment
        goal.save()

        appraisal = Appraisal.objects.filter(cycle=goal.cycle, employee=goal.employee).first()
        if appraisal:
            recalculate_appraisal_rating(appraisal)

        return Response(GoalSerializer(goal).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def manager_rate(self, request, pk=None):
        """Manager rates a goal."""
        goal = self.get_object()

        if not is_manager_of(request.user, goal.employee) and not is_hr_or_admin(request.user):
            return Response({'error': 'Only the manager or HR/Admin can rate this goal.'}, status=status.HTTP_403_FORBIDDEN)

        rating = request.data.get('manager_rating')
        comment = request.data.get('manager_comment', '')

        if rating is not None:
            try:
                rating = int(rating)
                if not (1 <= rating <= 5):
                    raise ValueError
            except (ValueError, TypeError):
                return Response({'error': 'manager_rating must be 1–5.'}, status=status.HTTP_400_BAD_REQUEST)

        goal.manager_rating = rating
        goal.manager_comment = comment
        goal.save()

        appraisal = Appraisal.objects.filter(cycle=goal.cycle, employee=goal.employee).first()
        if appraisal:
            recalculate_appraisal_rating(appraisal)

        return Response(GoalSerializer(goal).data, status=status.HTTP_200_OK)

    # Legacy action names (kept for backwards compat)
    @action(detail=True, methods=['post'])
    def self_assess(self, request, pk=None):
        return self.self_rate(request, pk=pk)

    @action(detail=True, methods=['post'])
    def manager_review(self, request, pk=None):
        return self.manager_rate(request, pk=pk)


# ─── Appraisals ────────────────────────────────────────────────────────────────

class AppraisalViewSet(viewsets.ModelViewSet):
    queryset = Appraisal.objects.all()
    serializer_class = AppraisalSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = Appraisal.objects.select_related('cycle', 'employee').all()
        scope = self.request.query_params.get('scope')
        emp_id = self.request.query_params.get('employee_id')
        cycle_id = self.request.query_params.get('cycle_id')

        current_emp = get_employee(self.request)
        if scope == 'mine' and current_emp:
            qs = qs.filter(employee=current_emp)
        elif emp_id:
            qs = qs.filter(employee_id=emp_id)
        if cycle_id:
            qs = qs.filter(cycle_id=cycle_id)

        return qs

    @action(detail=True, methods=['post'])
    def evaluate_factors(self, request, pk=None):
        """Manager evaluates punctuality, quality, productivity, teamwork, initiative."""
        appraisal = self.get_object()

        if not is_manager_of(request.user, appraisal.employee) and not is_hr_or_admin(request.user):
            return Response(
                {'error': 'Only the employee manager or HR/Admin can evaluate performance factors.'},
                status=status.HTTP_403_FORBIDDEN
            )

        factor_fields = [
            'punctuality_rating', 'quality_rating', 'productivity_rating',
            'teamwork_rating', 'initiative_rating',
        ]
        text_fields = [
            'punctuality_comment', 'quality_comment', 'productivity_comment',
            'teamwork_comment', 'initiative_comment', 'manager_notes', 'employee_notes',
        ]

        for field in factor_fields:
            val = request.data.get(field)
            if val is not None:
                try:
                    v = int(val)
                    if not (1 <= v <= 5):
                        raise ValueError
                    setattr(appraisal, field, v)
                except (ValueError, TypeError):
                    return Response({'error': f'{field} must be 1–5.'}, status=status.HTTP_400_BAD_REQUEST)

        for field in text_fields:
            if field in request.data:
                setattr(appraisal, field, str(request.data[field]))

        appraisal.save()
        recalculate_appraisal_rating(appraisal)
        return Response(AppraisalSerializer(appraisal).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def finalize(self, request, pk=None):
        appraisal = self.get_object()
        current_emp = get_employee(request)

        if not is_manager_of(request.user, appraisal.employee) and not is_hr_or_admin(request.user):
            return Response(
                {'error': 'Only the employee manager or HR/Admin can finalise the appraisal.'},
                status=status.HTTP_403_FORBIDDEN
            )

        recalculate_appraisal_rating(appraisal)
        appraisal.status = 'completed'
        appraisal.finalized_by = current_emp
        appraisal.finalized_on = timezone.now()
        appraisal.save()

        return Response(AppraisalSerializer(appraisal).data, status=status.HTTP_200_OK)


# ─── Employee-facing endpoints (function-based views) ─────────────────────────

@api_view(['GET'])
@pc([permissions.IsAuthenticated])
def my_appraisal(request):
    """Returns the current employee's active cycle appraisal with goals."""
    emp = get_employee(request)
    if not emp:
        return Response({'detail': 'Employee profile not found.'}, status=status.HTTP_404_NOT_FOUND)

    active_cycle = AppraisalCycle.objects.filter(status='active').order_by('-start_date').first()
    if not active_cycle:
        return Response({'detail': 'No active appraisal cycle.'}, status=status.HTTP_404_NOT_FOUND)

    appraisal, _ = Appraisal.objects.get_or_create(cycle=active_cycle, employee=emp)
    data = AppraisalSerializer(appraisal).data
    return Response(data)


@api_view(['POST'])
@pc([permissions.IsAuthenticated])
def self_assessment(request):
    """Employee submits their overall self-assessment for the active cycle."""
    emp = get_employee(request)
    if not emp:
        return Response({'detail': 'Employee profile not found.'}, status=status.HTTP_404_NOT_FOUND)

    active_cycle = AppraisalCycle.objects.filter(status='active').order_by('-start_date').first()
    if not active_cycle:
        return Response({'detail': 'No active cycle.'}, status=status.HTTP_404_NOT_FOUND)

    appraisal, _ = Appraisal.objects.get_or_create(cycle=active_cycle, employee=emp)

    notes = request.data.get('self_assessment') or request.data.get('employee_notes', '')
    appraisal.employee_notes = notes
    appraisal.status = 'manager_review_pending'
    appraisal.save()
    recalculate_appraisal_rating(appraisal)

    return Response(AppraisalSerializer(appraisal).data, status=status.HTTP_200_OK)


@api_view(['GET'])
@pc([permissions.IsAuthenticated])
def team_appraisals(request):
    """
    Returns a list of employees under the requesting manager (or all if HR/Admin)
    along with their active cycle appraisal data and goals.
    """
    active_cycle = AppraisalCycle.objects.filter(status='active').order_by('-start_date').first()
    if not active_cycle:
        return Response([], status=status.HTTP_200_OK)

    if is_hr_or_admin(request.user):
        appraisals = Appraisal.objects.filter(cycle=active_cycle).select_related('employee')
    else:
        # Get employees managed by this user
        managed = Employee.objects.filter(manager=request.user)
        if not managed.exists():
            # Try managers M2M relation if present
            try:
                managed = Employee.objects.filter(managers=request.user)
            except Exception:
                managed = Employee.objects.none()
        appraisals = Appraisal.objects.filter(cycle=active_cycle, employee__in=managed).select_related('employee')

    result = []
    for appraisal in appraisals:
        emp = appraisal.employee
        goals = Goal.objects.filter(cycle=active_cycle, employee=emp)
        goals_data = GoalSerializer(goals, many=True).data
        result.append({
            'employee_id': emp.id,
            'employee_name': emp.name,
            'designation': getattr(emp, 'designation', ''),
            'department': getattr(emp, 'department', ''),
            'finalized': appraisal.status == 'completed',
            'overall_rating': appraisal.overall_rating,
            'appraisal_id': appraisal.id,
            'status': appraisal.status,
            'goals': goals_data,
            # Factor data
            'punctuality_rating': appraisal.punctuality_rating,
            'quality_rating': appraisal.quality_rating,
            'productivity_rating': appraisal.productivity_rating,
            'teamwork_rating': appraisal.teamwork_rating,
            'initiative_rating': appraisal.initiative_rating,
            'manager_notes': appraisal.manager_notes,
        })

    return Response(result, status=status.HTTP_200_OK)


@api_view(['POST'])
@pc([permissions.IsAuthenticated])
def finalize_employee_appraisal(request, employee_id):
    """Finalize a specific employee's appraisal in the active cycle."""
    active_cycle = AppraisalCycle.objects.filter(status='active').order_by('-start_date').first()
    if not active_cycle:
        return Response({'detail': 'No active cycle.'}, status=status.HTTP_404_NOT_FOUND)

    try:
        emp = Employee.objects.get(id=employee_id)
    except Employee.DoesNotExist:
        return Response({'detail': 'Employee not found.'}, status=status.HTTP_404_NOT_FOUND)

    if not is_manager_of(request.user, emp) and not is_hr_or_admin(request.user):
        return Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

    appraisal = Appraisal.objects.filter(cycle=active_cycle, employee=emp).first()
    if not appraisal:
        return Response({'detail': 'Appraisal not found.'}, status=status.HTTP_404_NOT_FOUND)

    current_emp = get_employee(request)
    recalculate_appraisal_rating(appraisal)
    appraisal.status = 'completed'
    appraisal.finalized_by = current_emp
    appraisal.finalized_on = timezone.now()
    appraisal.save()

    return Response({'detail': 'Appraisal finalised.', 'overall_rating': appraisal.overall_rating})

@api_view(['GET'])
@pc([permissions.IsAuthenticated])
def generate_appraisal_pdf(request, appraisal_id):
    """Generate a high-quality MNC-grade PDF report for the specified appraisal using ReportLab."""
    try:
        appraisal = Appraisal.objects.select_related('cycle', 'employee').get(id=appraisal_id)
    except Appraisal.DoesNotExist:
        return Response({'detail': 'Appraisal not found.'}, status=status.HTTP_404_NOT_FOUND)

    employee = appraisal.employee
    cycle = appraisal.cycle
    goals = Goal.objects.filter(cycle=cycle, employee=employee)

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()

    brand_style = ParagraphStyle(
        'DocBrand',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=14,
        textColor=colors.HexColor('#2563EB'),
        alignment=TA_CENTER
    )

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=colors.HexColor('#0F172A'),
        alignment=TA_CENTER,
        spaceAfter=2
    )

    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#64748B'),
        alignment=TA_CENTER
    )

    body_style = ParagraphStyle(
        'BodyDark',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=colors.HexColor('#334155')
    )

    bold_style = ParagraphStyle(
        'BodyBold',
        parent=body_style,
        fontName='Helvetica-Bold',
        textColor=colors.HexColor('#0F172A')
    )

    sec_heading = ParagraphStyle(
        'SecHeading',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=colors.HexColor('#1E293B'),
        spaceBefore=10,
        spaceAfter=6
    )

    story = []

    # 1. Header Banner
    story.append(Paragraph("VIBE TECH LABS — HR PERFORMANCE SYSTEM", brand_style))
    story.append(Spacer(1, 4))
    story.append(Paragraph("ANNUAL PERFORMANCE APPRAISAL DOSSIER", title_style))
    story.append(Paragraph("Official Executive Performance Review & Assessment Report", subtitle_style))
    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#2563EB'), spaceAfter=12))

    # 2. Executive Summary Box (Employee Info & Score)
    overall = appraisal.overall_rating or 0.0
    overall_label = RATING_LABELS.get(round(overall), "Pending Evaluation")
    status_display = dict(Appraisal.STATUS_CHOICES).get(appraisal.status, appraisal.status)

    meta_data = [
        [
            Paragraph(f"<b>Employee Name:</b> {employee.name}", body_style),
            Paragraph(f"<b>Department:</b> {getattr(employee, 'department', '') or 'N/A'}", body_style)
        ],
        [
            Paragraph(f"<b>Designation:</b> {getattr(employee, 'designation', '') or 'Staff Member'}", body_style),
            Paragraph(f"<b>Cycle:</b> {cycle.name}", body_style)
        ],
        [
            Paragraph(f"<b>Appraisal Status:</b> {status_display}", body_style),
            Paragraph(f"<b>Final Score:</b> <font color='#2563EB'><b>{overall:.1f} / 5.0</b></font> ({overall_label})", body_style)
        ]
    ]
    t_meta = Table(meta_data, colWidths=[270, 270])
    t_meta.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F8FAFC')),
        ('PADDING', (0,0), (-1,-1), 7),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E1')),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(t_meta)
    story.append(Spacer(1, 14))

    # 3. Performance Factors Evaluation (40% Weightage)
    story.append(Paragraph("1. Performance Factors Evaluation (40% Weightage)", sec_heading))

    factors = [
        ("Punctuality & Attendance", appraisal.punctuality_rating, appraisal.punctuality_comment, "Timeliness, late arrival compliance, attendance regularity"),
        ("Work Quality & Accuracy", appraisal.quality_rating, appraisal.quality_comment, "Output precision, attention to detail, deliverable completeness"),
        ("Productivity & Speed", appraisal.productivity_rating, appraisal.productivity_comment, "Task completion rate, deadline adherence, work volume"),
        ("Teamwork & Communication", appraisal.teamwork_rating, appraisal.teamwork_comment, "Collaboration, responsiveness, interpersonal engagement"),
        ("Initiative & Problem Solving", appraisal.initiative_rating, appraisal.initiative_comment, "Self-motivation, ownership, creative problem resolution"),
    ]

    factor_table_data = [
        [Paragraph("<b>Performance Factor</b>", bold_style), Paragraph("<b>Score</b>", bold_style), Paragraph("<b>Manager / Higher Authority Notes</b>", bold_style)]
    ]

    for label, rating, comment, desc in factors:
        score_text = f"<b>{rating} / 5</b>" if rating else "<i>Not Rated</i>"
        notes_text = comment if comment else f"<font color='#94A3B8'>{desc}</font>"
        factor_table_data.append([
            Paragraph(f"<b>{label}</b><br/><font size=7 color='#64748B'>{desc}</font>", body_style),
            Paragraph(score_text, body_style),
            Paragraph(notes_text, body_style)
        ])

    t_factors = Table(factor_table_data, colWidths=[160, 60, 320])
    t_factors.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#F1F5F9')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E1')),
        ('PADDING', (0,0), (-1,-1), 6),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ]))
    story.append(t_factors)
    story.append(Spacer(1, 14))

    # 4. Goals & Objectives Evaluation (60% Weightage)
    story.append(Paragraph("2. Key Performance Goals & Objectives (60% Weightage)", sec_heading))

    goals_table_data = [
        [
            Paragraph("<b>Goal Title</b>", bold_style),
            Paragraph("<b>Weight</b>", bold_style),
            Paragraph("<b>Self</b>", bold_style),
            Paragraph("<b>Manager</b>", bold_style),
            Paragraph("<b>Manager Evaluation Comments</b>", bold_style)
        ]
    ]

    if goals.exists():
        for g in goals:
            self_r = f"{g.self_rating}/5" if g.self_rating else "-"
            mgr_r = f"{g.manager_rating}/5" if g.manager_rating else "-"
            mgr_c = g.manager_comment if g.manager_comment else "-"
            goals_table_data.append([
                Paragraph(f"<b>{g.title}</b><br/><font size=7 color='#64748B'>{g.target_metric or ''}</font>", body_style),
                Paragraph(f"{g.weightage}%", body_style),
                Paragraph(self_r, body_style),
                Paragraph(mgr_r, body_style),
                Paragraph(mgr_c, body_style),
            ])
    else:
        goals_table_data.append([
            Paragraph("<i>No specific goals assigned for this cycle.</i>", body_style),
            Paragraph("-", body_style),
            Paragraph("-", body_style),
            Paragraph("-", body_style),
            Paragraph("-", body_style),
        ])

    t_goals = Table(goals_table_data, colWidths=[160, 45, 45, 55, 235])
    t_goals.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#F1F5F9')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E1')),
        ('PADDING', (0,0), (-1,-1), 6),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ]))
    story.append(t_goals)
    story.append(Spacer(1, 14))

    # 5. Narrative Notes Section
    notes_data = []
    if appraisal.manager_notes:
        notes_data.append([Paragraph("<b>Manager Overall Feedback & Growth Plan:</b>", bold_style)])
        notes_data.append([Paragraph(appraisal.manager_notes, body_style)])
        notes_data.append([Spacer(1, 6)])

    if appraisal.employee_notes:
        notes_data.append([Paragraph("<b>Employee Self-Assessment Statement:</b>", bold_style)])
        notes_data.append([Paragraph(appraisal.employee_notes, body_style)])

    if notes_data:
        story.append(Paragraph("3. Executive Comments & Self Assessment", sec_heading))
        t_notes = Table(notes_data, colWidths=[540])
        t_notes.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F8FAFC')),
            ('PADDING', (0,0), (-1,-1), 8),
            ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#E2E8F0')),
        ]))
        story.append(t_notes)
        story.append(Spacer(1, 16))

    # 6. Sign-off Footer
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#CBD5E1'), spaceAfter=12))

    fin_by = appraisal.finalized_by.name if appraisal.finalized_by else "Manager / HR Authority"
    fin_date = appraisal.finalized_on.strftime('%B %d, %Y') if appraisal.finalized_on else timezone.now().strftime('%B %d, %Y')

    footer_data = [
        [
            Paragraph(f"<b>Evaluated By:</b> {fin_by}", body_style),
            Paragraph(f"<b>Date:</b> {fin_date}", body_style),
            Paragraph("<b>HR Authorization:</b> Approved & Archived", body_style),
        ]
    ]
    t_foot = Table(footer_data, colWidths=[180, 150, 210])
    t_foot.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(t_foot)

    doc.build(story)

    pdf = buffer.getvalue()
    buffer.close()

    emp_clean_name = "".join(c for c in employee.name if c.isalnum() or c in (' ', '_')).strip().replace(' ', '_')
    response = HttpResponse(pdf, content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="Appraisal_{emp_clean_name}_{cycle.id}.pdf"'
    return response

