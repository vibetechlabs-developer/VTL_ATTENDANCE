import re
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .models import PolicyDocument, LetterTemplate, GeneratedLetter
from .serializers import (
    PolicyDocumentSerializer,
    LetterTemplateSerializer,
    GeneratedLetterSerializer
)
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


class PolicyDocumentViewSet(viewsets.ModelViewSet):
    queryset = PolicyDocument.objects.all()
    serializer_class = PolicyDocumentSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = PolicyDocument.objects.all()
        is_active_param = self.request.query_params.get('is_active')

        if is_active_param is not None:
            is_active_bool = is_active_param.lower() in ['true', '1', 'yes']
            qs = qs.filter(is_active=is_active_bool)
        elif not is_hr_or_admin(self.request.user):
            # Default to active policies for general employees
            qs = qs.filter(is_active=True)

        return qs

    def perform_create(self, serializer):
        if not is_hr_or_admin(self.request.user):
            raise permissions.PermissionDenied("Only HR/Admin can publish policy documents.")

        title = serializer.validated_data.get('title')
        is_active = serializer.validated_data.get('is_active', True)

        # Deactivate old versions of the same policy if new version is marked active
        if is_active and title:
            PolicyDocument.objects.filter(title=title, is_active=True).update(is_active=False)

        current_emp = get_employee(self.request)
        serializer.save(published_by=current_emp)

    def perform_update(self, serializer):
        if not is_hr_or_admin(self.request.user):
            raise permissions.PermissionDenied("Only HR/Admin can update policy documents.")
        serializer.save()

    def perform_destroy(self, instance):
        if not is_hr_or_admin(self.request.user):
            raise permissions.PermissionDenied("Only HR/Admin can delete policy documents.")
        instance.delete()


class LetterTemplateViewSet(viewsets.ModelViewSet):
    queryset = LetterTemplate.objects.all()
    serializer_class = LetterTemplateSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        # Fix typo if any legacy item has typo
        LetterTemplate.objects.filter(name="Standard Employee Latter").update(name="Standard Employment Offer Letter")
        if not qs.exists():
            self._seed_default_templates()
            qs = super().get_queryset()
        return qs

    def _seed_default_templates(self):
        defaults = [
            {
                "name": "Standard Employment Offer Letter",
                "subject_template": "Offer of Employment - {{employee.name}}",
                "body_template": (
                    "We are pleased to offer you employment with Vibe Tech Labs Pvt. Ltd. "
                    "in the role of {{employee.designation}} within the {{employee.department}} department.\n\n"
                    "Your date of joining will be {{employee.date_of_joining}}. Your employee code is {{employee.employee_code}}.\n\n"
                    "Key Terms & Conditions:\n"
                    "1. Role & Reporting: You will report to the department head and carry out duties relevant to your position.\n"
                    "2. Compensation: Your CTC structure and benefits package are governed by corporate policy.\n"
                    "3. Probation: You will undergo a 90-day probationary evaluation.\n"
                    "4. Confidentiality: You agree to abide by all organizational policies, IP protection rules, and security guidelines.\n\n"
                    "Please confirm your acceptance by signing and returning a copy of this letter.\n\n"
                    "Yours Sincerely,\nFor Vibe Tech Labs Pvt. Ltd.\n\nHead - Human Resources"
                )
            },
            {
                "name": "Experience & Relieving Certificate",
                "subject_template": "Experience & Relieving Certificate - {{employee.name}}",
                "body_template": (
                    "TO WHOMSOEVER IT MAY CONCERN\n\n"
                    "This is to certify that {{employee.name}} (Employee Code: {{employee.employee_code}}) "
                    "was employed with Vibe Tech Labs Pvt. Ltd. as {{employee.designation}} "
                    "in the {{employee.department}} department from {{employee.date_of_joining}}.\n\n"
                    "During the tenure with our organization, {{employee.name}} demonstrated exemplary professional performance, dedication, and character. "
                    "All organizational dues and responsibilities have been formally settled.\n\n"
                    "{{employee.name}} is relieved from all duties with effect from today. "
                    "We wish {{employee.name}} every success in future endeavors.\n\n"
                    "For Vibe Tech Labs Pvt. Ltd.\n\nManager - Human Resources"
                )
            },
            {
                "name": "Promotion & Salary Revision Letter",
                "subject_template": "Letter of Promotion & Revision - {{employee.name}}",
                "body_template": (
                    "Dear {{employee.name}},\n\n"
                    "In recognition of your outstanding performance, dedication, and leadership at Vibe Tech Labs Pvt. Ltd., "
                    "management is delighted to announce your promotion to the position of {{employee.designation}} "
                    "in the {{employee.department}} department.\n\n"
                    "This promotion is effective immediately. Along with your elevated responsibilities, your compensation "
                    "has been revised in accordance with corporate grade structures.\n\n"
                    "We appreciate your valuable contributions and wish you continued growth.\n\n"
                    "Yours Sincerely,\nFor Vibe Tech Labs Pvt. Ltd.\n\nDirector - Human Resources"
                )
            },
            {
                "name": "Official Employment Verification Statement",
                "subject_template": "Employment Verification Statement - {{employee.name}}",
                "body_template": (
                    "TO WHOM IT MAY CONCERN\n\n"
                    "This statement confirms that {{employee.name}} (Employee Code: {{employee.employee_code}}) "
                    "is a full-time active employee of Vibe Tech Labs Pvt. Ltd., serving as {{employee.designation}} "
                    "in the {{employee.department}} department since {{employee.date_of_joining}}.\n\n"
                    "This letter is issued upon the request of the employee for verification purposes.\n\n"
                    "For Vibe Tech Labs Pvt. Ltd.\n\nAuthorized HR Representative"
                )
            }
        ]
        for tpl in defaults:
            LetterTemplate.objects.create(**tpl)

    @action(detail=False, methods=['post'])
    def seed_defaults(self, request):
        if not is_hr_or_admin(request.user):
            return Response({'error': 'Only HR/Admin can seed templates.'}, status=status.HTTP_403_FORBIDDEN)
        self._seed_default_templates()
        return Response({'message': 'Default MNC templates created successfully.'}, status=status.HTTP_201_CREATED)

    def perform_create(self, serializer):
        if not is_hr_or_admin(self.request.user):
            raise permissions.PermissionDenied("Only HR/Admin can create letter templates.")
        current_emp = get_employee(self.request)
        serializer.save(created_by=current_emp)

    def perform_update(self, serializer):
        if not is_hr_or_admin(self.request.user):
            raise permissions.PermissionDenied("Only HR/Admin can edit letter templates.")
        serializer.save()

    def perform_destroy(self, instance):
        if not is_hr_or_admin(self.request.user):
            raise permissions.PermissionDenied("Only HR/Admin can delete letter templates.")
        instance.delete()


class GeneratedLetterViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = GeneratedLetter.objects.select_related('template', 'employee', 'generated_by').all()
    serializer_class = GeneratedLetterSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = GeneratedLetter.objects.select_related('template', 'employee', 'generated_by').all()
        scope = self.request.query_params.get('scope')
        emp_id = self.request.query_params.get('employee_id')

        current_emp = get_employee(self.request)
        if scope == 'mine' and current_emp:
            qs = qs.filter(employee=current_emp)
        elif emp_id and is_hr_or_admin(self.request.user):
            qs = qs.filter(employee_id=emp_id)
        elif not is_hr_or_admin(self.request.user) and current_emp:
            qs = qs.filter(employee=current_emp)

        return qs

    @action(detail=False, methods=['post'])
    def generate(self, request):
        if not is_hr_or_admin(request.user):
            return Response({'error': 'Only HR/Admin can generate letters.'}, status=status.HTTP_403_FORBIDDEN)

        template_id = request.data.get('template_id')
        employee_id = request.data.get('employee_id')

        if not template_id or not employee_id:
            return Response({'error': 'Both template_id and employee_id are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            template = LetterTemplate.objects.get(id=template_id)
        except LetterTemplate.DoesNotExist:
            return Response({'error': 'LetterTemplate not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            target_emp = Employee.objects.get(id=employee_id)
        except Employee.DoesNotExist:
            return Response({'error': 'Employee not found.'}, status=status.HTTP_404_NOT_FOUND)

        import datetime
        today_str = datetime.date.today().strftime('%d %B %Y')
        emp_code = str(getattr(target_emp, 'employee_code', '') or f"EMP{target_emp.id:04d}")

        content = template.body_template

        replacements = {
            '{{employee.name}}': target_emp.name,
            '{{employee.designation}}': str(getattr(target_emp, 'designation', '') or 'Team Member'),
            '{{employee.department}}': target_emp.department or 'General',
            '{{employee.date_of_joining}}': str(getattr(target_emp, 'date_of_joining', '') or 'As per records'),
            '{{employee.employee_code}}': emp_code,
            '{{employee.phone}}': target_emp.phone or 'N/A',
            '{{employee.email}}': target_emp.user.email if (target_emp.user and target_emp.user.email) else (target_emp.email or 'N/A'),
            '{{date}}': today_str,
            '{{ref_number}}': f"VTL/HR/{datetime.date.today().year}/{emp_code}",
        }

        for placeholder, value in replacements.items():
            content = content.replace(placeholder, str(value or ''))

        current_emp = get_employee(request)

        gen_letter = GeneratedLetter.objects.create(
            template=template,
            employee=target_emp,
            generated_content=content,
            generated_by=current_emp
        )

        return Response(GeneratedLetterSerializer(gen_letter).data, status=status.HTTP_201_CREATED)
