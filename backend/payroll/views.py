import calendar
from django.db import models
from decimal import Decimal, InvalidOperation, ROUND_UP, ROUND_DOWN, ROUND_HALF_UP

from django.utils import timezone
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import (
    SalaryComponent,
    SalaryStructure,
    SalaryStructureComponent,
    PayrollRun,
    Payslip,
    CompanyPayrollPolicy,
    StatutoryConfig,
    ProfessionalTaxSlab,
    EmployeeLoan,
    LoanRepaymentSchedule,
    ReimbursementClaim,
    PayrollRevision,
)
from .utils import amount_to_words, render_payslip_to_pdf

from .serializers import (
    SalaryComponentSerializer,
    SalaryStructureSerializer,
    SalaryStructureComponentSerializer,
    PayrollRunSerializer,
    PayslipSerializer,
    CompanyPayrollPolicySerializer,
    StatutoryConfigSerializer,
    ProfessionalTaxSlabSerializer,
    EmployeeLoanSerializer,
    ReimbursementClaimSerializer,
    PayrollRevisionSerializer,
)
from users.models import Employee
from leave.models import LeaveApplication


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


def parse_salary(salary_str):
    """Parse salary field which may be a number or string like '50000' or '50,000'."""
    if not salary_str:
        return Decimal('0')
    cleaned = str(salary_str).replace(',', '').replace(' ', '').strip()
    try:
        return Decimal(cleaned)
    except (InvalidOperation, ValueError):
        return Decimal('0')


def build_auto_breakdown(gross_salary):
    """
    Build a standard salary breakdown from CTC using the common Indian salary structure:
    - Basic: 40% of CTC
    - HRA: 20% of CTC (50% of Basic for metro)
    - Special Allowance: 30% of CTC
    - PF Employee: 12% of Basic (deduction)
    - Professional Tax: fixed ₹200 (deduction)
    Total deductions = PF + PT
    Net = Gross - deductions
    """
    basic = (gross_salary * Decimal('0.40')).quantize(Decimal('0.01'))
    hra = (gross_salary * Decimal('0.20')).quantize(Decimal('0.01'))
    special_allowance = (gross_salary - basic - hra).quantize(Decimal('0.01'))
    pf = (basic * Decimal('0.12')).quantize(Decimal('0.01'))
    professional_tax = Decimal('200.00')

    earnings = gross_salary
    deductions = pf + professional_tax
    net_pay = earnings - deductions

    breakdown = [
        {'component_name': 'Basic Salary', 'component_type': 'earning', 'calculation_type': 'fixed', 'raw_value': float(basic), 'final_value': float(basic)},
        {'component_name': 'HRA', 'component_type': 'earning', 'calculation_type': 'fixed', 'raw_value': float(hra), 'final_value': float(hra)},
        {'component_name': 'Special Allowance', 'component_type': 'earning', 'calculation_type': 'fixed', 'raw_value': float(special_allowance), 'final_value': float(special_allowance)},
        {'component_name': 'PF (Employee)', 'component_type': 'deduction', 'calculation_type': 'percentage', 'raw_value': float(pf), 'final_value': float(pf)},
        {'component_name': 'Professional Tax', 'component_type': 'deduction', 'calculation_type': 'fixed', 'raw_value': float(professional_tax), 'final_value': float(professional_tax)},
    ]
    return earnings, deductions, net_pay, breakdown


class SalaryComponentViewSet(viewsets.ModelViewSet):
    queryset = SalaryComponent.objects.all()
    serializer_class = SalaryComponentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        if not is_hr_or_admin(self.request.user):
            raise permissions.PermissionDenied("Only HR/Admin can create salary components.")
        serializer.save()

    def perform_update(self, serializer):
        if not is_hr_or_admin(self.request.user):
            raise permissions.PermissionDenied("Only HR/Admin can update salary components.")
        serializer.save()

    def perform_destroy(self, instance):
        if not is_hr_or_admin(self.request.user):
            raise permissions.PermissionDenied("Only HR/Admin can delete salary components.")
        instance.delete()


class SalaryStructureViewSet(viewsets.ModelViewSet):
    queryset = SalaryStructure.objects.prefetch_related('components__component').all()
    serializer_class = SalaryStructureSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = SalaryStructure.objects.select_related('employee').prefetch_related('components__component').all()
        emp_id = self.request.query_params.get('employee_id')
        if emp_id:
            qs = qs.filter(employee_id=emp_id)
        current_emp = get_employee(self.request)
        if not is_hr_or_admin(self.request.user) and current_emp:
            qs = qs.filter(employee=current_emp)
        return qs

    def perform_create(self, serializer):
        if not is_hr_or_admin(self.request.user):
            raise permissions.PermissionDenied("Only HR/Admin can manage salary structures.")
        serializer.save()

    @action(detail=False, methods=['post'])
    def upsert(self, request):
        """
        Upsert a salary structure for an employee.
        Payload: { employee_id, effective_from, components: [{component_id, value}] }
        """
        if not is_hr_or_admin(request.user):
            return Response({'error': 'Only HR/Admin can manage salary structures.'}, status=status.HTTP_403_FORBIDDEN)

        employee_id = request.data.get('employee_id')
        effective_from = request.data.get('effective_from')
        components = request.data.get('components', [])

        if not employee_id or not effective_from:
            return Response({'error': 'employee_id and effective_from are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            emp = Employee.objects.get(id=employee_id)
        except Employee.DoesNotExist:
            return Response({'error': 'Employee not found.'}, status=status.HTTP_404_NOT_FOUND)

        struct, _ = SalaryStructure.objects.update_or_create(
            employee=emp,
            defaults={'effective_from': effective_from}
        )

        # Replace components
        SalaryStructureComponent.objects.filter(salary_structure=struct).delete()
        for comp_data in components:
            comp_id = comp_data.get('component_id') or comp_data.get('component')
            value = comp_data.get('value', 0)
            if comp_id:
                try:
                    comp = SalaryComponent.objects.get(id=comp_id)
                    SalaryStructureComponent.objects.create(
                        salary_structure=struct, component=comp, value=value
                    )
                except SalaryComponent.DoesNotExist:
                    pass

        serializer = SalaryStructureSerializer(struct)
        return Response(serializer.data, status=status.HTTP_200_OK)


class PayrollRunViewSet(viewsets.ModelViewSet):
    queryset = PayrollRun.objects.all()
    serializer_class = PayrollRunSerializer
    permission_classes = [permissions.IsAuthenticated]

    @action(detail=False, methods=['post'])
    def generate(self, request):
        if not is_hr_or_admin(request.user):
            return Response({'error': 'Only HR/Admin can generate payroll runs.'}, status=status.HTTP_403_FORBIDDEN)

        month = request.data.get('month')
        year = request.data.get('year')

        try:
            month = int(month)
            year = int(year)
            if not (1 <= month <= 12):
                raise ValueError
        except (ValueError, TypeError):
            return Response({'error': 'Valid month (1-12) and year are required.'}, status=status.HTTP_400_BAD_REQUEST)

        current_emp = get_employee(request)

        payroll_run, created = PayrollRun.objects.get_or_create(
            month=month,
            year=year,
            defaults={'status': 'draft', 'generated_by': current_emp}
        )

        if payroll_run.status == 'locked':
            return Response({'error': 'Payroll run for this month/year is locked and cannot be regenerated.'}, status=status.HTTP_400_BAD_REQUEST)

        # Total working days in month
        _, total_days_in_month = calendar.monthrange(year, month)
        working_days = Decimal(str(total_days_in_month))

        payslips_created = 0
        skipped = 0

        # --- Strategy 1: Employees WITH a formal SalaryStructure ---
        structures = SalaryStructure.objects.select_related('employee').prefetch_related('components__component').all()
        structured_emp_ids = set()

        for struct in structures:
            emp = struct.employee
            structured_emp_ids.add(emp.id)

            lop_days = _get_lop_days(emp, year, month)
            prorate_factor = _prorate(working_days, lop_days)

            gross_earnings = Decimal('0')
            total_deductions = Decimal('0')
            breakdown_data = []

            component_values = {}
            for s_comp in struct.components.all():
                comp = s_comp.component
                if comp.calculation_type == 'fixed':
                    component_values[comp.id] = Decimal(str(s_comp.value))

            for s_comp in struct.components.all():
                comp = s_comp.component
                if comp.calculation_type == 'percentage':
                    base_comp = comp.percentage_of
                    base_val = component_values.get(base_comp.id, Decimal('0')) if base_comp else Decimal('0')
                    pct = Decimal(str(s_comp.value))
                    component_values[comp.id] = base_val * (pct / Decimal('100'))

            for s_comp in struct.components.all():
                comp = s_comp.component
                raw_val = component_values.get(comp.id, Decimal('0'))
                final_val = raw_val * prorate_factor if comp.component_type == 'earning' else raw_val

                if comp.component_type == 'earning':
                    gross_earnings += final_val
                else:
                    total_deductions += final_val

                breakdown_data.append({
                    'component_name': comp.name,
                    'component_type': comp.component_type,
                    'calculation_type': comp.calculation_type,
                    'raw_value': float(raw_val),
                    'final_value': float(final_val),
                })

            net_pay = gross_earnings - total_deductions
            basic_component_value = component_values.get(next((c.id for c in struct.components.all() if c.component.name == 'Basic Salary'), None), Decimal('0'))

            # Compute LOP amount based on policy
            policy = CompanyPayrollPolicy.objects.first()
            if not policy:
                policy = CompanyPayrollPolicy()

            if policy.lop_calculation_basis == 'calendar':
                divisor = Decimal(str(total_days_in_month))
            else:  # working days basis
                divisor = working_days
            per_day_salary = gross_earnings / divisor if divisor > 0 else Decimal('0')
            lop_amount = (lop_days * per_day_salary).quantize(Decimal('0.01'))

            # Professional Tax slab lookup (if ProfessionalTaxSlab entries exist)
            pt_amount = Decimal('0')
            pt_slab = ProfessionalTaxSlab.objects.filter(
                min_gross_salary__lte=gross_earnings
            ).filter(
                models.Q(max_gross_salary__gte=gross_earnings) | models.Q(max_gross_salary__isnull=True)
            ).first()
            if pt_slab:
                pt_amount = pt_slab.monthly_pt_amount
                total_deductions += pt_amount
                breakdown_data.append({
                    'component_name': 'Professional Tax',
                    'component_type': 'deduction',
                    'calculation_type': 'fixed',
                    'raw_value': float(pt_amount),
                    'final_value': float(pt_amount),
                })

            # Loan EMI deduction & capping
            loan_schedules = LoanRepaymentSchedule.objects.filter(
                loan__employee=emp,
                due_month=f"{year}-{month:02d}",
                paid=False
            )
            for sched in loan_schedules:
                loan = sched.loan
                emi_deduction = min(sched.amount, loan.remaining_balance)
                if emi_deduction > Decimal('0'):
                    total_deductions += emi_deduction
                    breakdown_data.append({
                        'component_name': f'Loan EMI (Loan #{loan.id})',
                        'component_type': 'deduction',
                        'calculation_type': 'fixed',
                        'raw_value': float(sched.amount),
                        'final_value': float(emi_deduction),
                    })
                    sched.paid = True
                    sched.paid_in_payroll_run = payroll_run
                    sched.save()
                    loan.remaining_balance = max(loan.remaining_balance - emi_deduction, Decimal('0'))
                    if loan.remaining_balance == Decimal('0'):
                        loan.status = 'CLOSED'
                    loan.save()

            # Reimbursement claims addition
            approved_claims = ReimbursementClaim.objects.filter(
                employee=emp,
                status='APPROVED',
                paid_in_payroll_run__isnull=True
            )
            reimb_total = Decimal('0')
            for claim in approved_claims:
                reimb_total += claim.amount
                claim.status = 'PAID'
                claim.paid_in_payroll_run = payroll_run
                claim.save()
                breakdown_data.append({
                    'component_name': f'Reimbursement ({claim.category})',
                    'component_type': 'earning',
                    'calculation_type': 'fixed',
                    'raw_value': float(claim.amount),
                    'final_value': float(claim.amount),
                })
            gross_earnings += reimb_total

            # Compute net pay before rounding
            net_pay = gross_earnings - total_deductions
            if policy.rounding_rule == 'up':
                net_pay = net_pay.quantize(Decimal('1'), rounding=ROUND_UP)
            elif policy.rounding_rule == 'down':
                net_pay = net_pay.quantize(Decimal('1'), rounding=ROUND_DOWN)
            else:  # nearest
                net_pay = net_pay.quantize(Decimal('1'), rounding=ROUND_HALF_UP)

            # Compute employer contributions using statutory config
            statutory = StatutoryConfig.objects.first()
            if not statutory:
                statutory = StatutoryConfig()

            basic_component_value = component_values.get(next((c.id for c in struct.components.all() if c.component.name == 'Basic Salary'), None), Decimal('0'))
            employer_pf = (basic_component_value * (statutory.pf_rate_employer / Decimal('100'))).quantize(Decimal('0.01'))
            if employer_pf > statutory.pf_ceiling:
                employer_pf = statutory.pf_ceiling

            # Employer ESI threshold check (gross <= 21000)
            if gross_earnings <= Decimal('21000.00'):
                employer_esi = (gross_earnings * (statutory.esi_rate_employer / Decimal('100'))).quantize(Decimal('0.01'))
            else:
                employer_esi = Decimal('0.00')

            employer_gratuity = (basic_component_value * Decimal('0.0481')).quantize(Decimal('0.01'))

            # Financial Year YTD accumulation (April to March)
            fy_start_year = year if month >= 4 else year - 1
            if month >= 4:
                prior_payslips = Payslip.objects.filter(
                    employee=emp,
                    payroll_run__year=year,
                    payroll_run__month__gte=4,
                    payroll_run__month__lt=month,
                )
            else:
                prior_payslips = Payslip.objects.filter(employee=emp).filter(
                    models.Q(payroll_run__year=year - 1, payroll_run__month__gte=4) |
                    models.Q(payroll_run__year=year, payroll_run__month__lt=month)
                )

            ytd_gross = (prior_payslips.aggregate(total=models.Sum('gross_earnings'))['total'] or Decimal('0')) + gross_earnings
            ytd_pf = (prior_payslips.aggregate(total=models.Sum('employer_pf'))['total'] or Decimal('0')) + employer_pf
            ytd_tds = (prior_payslips.aggregate(total=models.Sum('total_deductions'))['total'] or Decimal('0')) + total_deductions
            ytd_prof_tax = (prior_payslips.aggregate(total=models.Sum('total_deductions'))['total'] or Decimal('0')) + pt_amount

            net_pay_in_words = amount_to_words(net_pay)

            # Update or create the payslip
            Payslip.objects.update_or_create(
                payroll_run=payroll_run,
                employee=emp,
                defaults={
                    'gross_earnings': gross_earnings,
                    'total_deductions': total_deductions,
                    'net_pay': net_pay,
                    'lop_days': lop_days,
                    'lop_amount': lop_amount,
                    'employer_pf': employer_pf,
                    'employer_esi': employer_esi,
                    'employer_gratuity': employer_gratuity,
                    'ytd_gross': ytd_gross,
                    'ytd_pf': ytd_pf,
                    'ytd_tds': ytd_tds,
                    'ytd_prof_tax': ytd_prof_tax,
                    'net_pay_in_words': net_pay_in_words,
                    'breakdown': breakdown_data,
                }
            )
            payslip_obj = Payslip.objects.get(payroll_run=payroll_run, employee=emp)
            payslip_obj.pdf_path = render_payslip_to_pdf(payslip_obj)
            payslip_obj.save()
            payslips_created += 1

        # --- Strategy 2: Employees WITHOUT SalaryStructure but with salary field ---
        remaining_employees = Employee.objects.exclude(id__in=structured_emp_ids)
        for emp in remaining_employees:
            salary_val = parse_salary(emp.salary)
            if salary_val <= 0:
                skipped += 1
                continue

            lop_days = _get_lop_days(emp, year, month)
            prorate_factor = _prorate(working_days, lop_days)

            # Prorate the gross salary
            gross_salary = (salary_val * prorate_factor).quantize(Decimal('0.01'))
            gross_earnings, total_deductions, net_pay, breakdown_data = build_auto_breakdown(gross_salary)

            policy = CompanyPayrollPolicy.objects.first() or CompanyPayrollPolicy()
            divisor = Decimal(str(total_days_in_month)) if policy.lop_calculation_basis == 'calendar' else working_days
            per_day_salary = salary_val / divisor if divisor > 0 else Decimal('0')
            lop_amount = (lop_days * per_day_salary).quantize(Decimal('0.01'))

            net_pay_in_words = amount_to_words(net_pay)

            # FY YTD accumulation
            fy_start_year = year if month >= 4 else year - 1
            if month >= 4:
                prior_payslips = Payslip.objects.filter(
                    employee=emp,
                    payroll_run__year=year,
                    payroll_run__month__gte=4,
                    payroll_run__month__lt=month,
                )
            else:
                prior_payslips = Payslip.objects.filter(employee=emp).filter(
                    models.Q(payroll_run__year=year - 1, payroll_run__month__gte=4) |
                    models.Q(payroll_run__year=year, payroll_run__month__lt=month)
                )

            ytd_gross = (prior_payslips.aggregate(total=models.Sum('gross_earnings'))['total'] or Decimal('0')) + gross_earnings
            ytd_pf = (prior_payslips.aggregate(total=models.Sum('employer_pf'))['total'] or Decimal('0'))
            ytd_tds = (prior_payslips.aggregate(total=models.Sum('total_deductions'))['total'] or Decimal('0')) + total_deductions
            ytd_prof_tax = (prior_payslips.aggregate(total=models.Sum('total_deductions'))['total'] or Decimal('0'))

            Payslip.objects.update_or_create(
                payroll_run=payroll_run,
                employee=emp,
                defaults={
                    'gross_earnings': gross_earnings,
                    'total_deductions': total_deductions,
                    'net_pay': net_pay,
                    'lop_days': lop_days,
                    'lop_amount': lop_amount,
                    'ytd_gross': ytd_gross,
                    'ytd_pf': ytd_pf,
                    'ytd_tds': ytd_tds,
                    'ytd_prof_tax': ytd_prof_tax,
                    'net_pay_in_words': net_pay_in_words,
                    'breakdown': breakdown_data,
                }
            )
            payslip_obj = Payslip.objects.get(payroll_run=payroll_run, employee=emp)
            payslip_obj.pdf_path = render_payslip_to_pdf(payslip_obj)
            payslip_obj.save()
            payslips_created += 1

        payroll_run.generated_on = timezone.now()
        payroll_run.save()

        msg = f'Payroll run generated for {month}/{year}. {payslips_created} salary slip(s) created.'
        if skipped:
            msg += f' {skipped} employee(s) skipped (no salary configured).'

        return Response(
            {
                'message': msg,
                'payroll_run': PayrollRunSerializer(payroll_run).data,
                'payslips_count': payslips_created,
                'skipped': skipped,
            },
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def finalize(self, request, pk=None):
        if not is_hr_or_admin(request.user):
            return Response({'error': 'Only HR/Admin can lock/finalize a payroll run.'}, status=status.HTTP_403_FORBIDDEN)

        payroll_run = self.get_object()
        payroll_run.status = 'locked'
        payroll_run.save()

        return Response(
            {'message': f'Payroll run #{payroll_run.id} is now locked.', 'payroll_run': PayrollRunSerializer(payroll_run).data},
            status=status.HTTP_200_OK
        )


class PayslipViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Payslip.objects.select_related('payroll_run', 'employee').all()
    serializer_class = PayslipSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = Payslip.objects.select_related('payroll_run', 'employee').all()
        scope = self.request.query_params.get('scope')
        emp_id = self.request.query_params.get('employee_id')
        month = self.request.query_params.get('month')
        year = self.request.query_params.get('year')

        current_emp = get_employee(self.request)
        if scope == 'mine' and current_emp:
            qs = qs.filter(employee=current_emp)
        elif emp_id and is_hr_or_admin(self.request.user):
            qs = qs.filter(employee_id=emp_id)
        elif not is_hr_or_admin(self.request.user) and current_emp:
            qs = qs.filter(employee=current_emp)

        if month and month != 'all':
            qs = qs.filter(payroll_run__month=month)
        if year:
            qs = qs.filter(payroll_run__year=year)

        return qs.order_by('-payroll_run__year', '-payroll_run__month')

    @action(detail=True, methods=['post'])
    def revise(self, request, pk=None):
        """
        Revise a payslip (even if payroll run is locked) with an explicit audit trail in PayrollRevision.
        Payload: { reason: "Correction of LOP days", lop_days: 1.5, breakdown: [...] }
        """
        if not is_hr_or_admin(request.user):
            return Response({'error': 'Only HR/Admin can revise a payslip.'}, status=status.HTTP_403_FORBIDDEN)

        payslip = self.get_object()
        reason = request.data.get('reason')
        if not reason:
            return Response({'error': 'Revision reason is required.'}, status=status.HTTP_400_BAD_REQUEST)

        current_emp = get_employee(request)

        old_values = {
            'gross_earnings': str(payslip.gross_earnings),
            'total_deductions': str(payslip.total_deductions),
            'net_pay': str(payslip.net_pay),
            'lop_days': str(payslip.lop_days),
            'breakdown': payslip.breakdown,
        }

        new_lop_days = request.data.get('lop_days', payslip.lop_days)
        new_breakdown = request.data.get('breakdown', payslip.breakdown)

        payslip.lop_days = Decimal(str(new_lop_days))
        payslip.breakdown = new_breakdown

        # Recalculate gross, deductions, net_pay
        gross_earnings = Decimal('0')
        total_deductions = Decimal('0')
        for item in new_breakdown:
            val = Decimal(str(item.get('final_value', 0)))
            if item.get('component_type') == 'earning':
                gross_earnings += val
            else:
                total_deductions += val

        payslip.gross_earnings = gross_earnings
        payslip.total_deductions = total_deductions
        payslip.net_pay = gross_earnings - total_deductions
        payslip.net_pay_in_words = amount_to_words(payslip.net_pay)
        payslip.pdf_path = render_payslip_to_pdf(payslip)
        payslip.save()

        new_values = {
            'gross_earnings': str(payslip.gross_earnings),
            'total_deductions': str(payslip.total_deductions),
            'net_pay': str(payslip.net_pay),
            'lop_days': str(payslip.lop_days),
            'breakdown': payslip.breakdown,
        }

        PayrollRevision.objects.create(
            payroll_run=payslip.payroll_run,
            payslip=payslip,
            revised_by=current_emp,
            reason=reason,
            old_values=old_values,
            new_values=new_values
        )

        return Response(
            {'message': 'Payslip successfully revised with audit log.', 'payslip': PayslipSerializer(payslip).data},
            status=status.HTTP_200_OK
        )


class CompanyPayrollPolicyViewSet(viewsets.ModelViewSet):
    queryset = CompanyPayrollPolicy.objects.all()
    serializer_class = CompanyPayrollPolicySerializer
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request, *args, **kwargs):
        policy = CompanyPayrollPolicy.objects.first()
        if not policy:
            policy = CompanyPayrollPolicy.objects.create()
        return Response(CompanyPayrollPolicySerializer(policy).data)

    def create(self, request, *args, **kwargs):
        if not is_hr_or_admin(request.user):
            return Response({'error': 'Only HR/Admin can update payroll policy.'}, status=status.HTTP_403_FORBIDDEN)
        policy = CompanyPayrollPolicy.objects.first() or CompanyPayrollPolicy()
        serializer = CompanyPayrollPolicySerializer(policy, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class StatutoryConfigViewSet(viewsets.ModelViewSet):
    queryset = StatutoryConfig.objects.all()
    serializer_class = StatutoryConfigSerializer
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request, *args, **kwargs):
        config = StatutoryConfig.objects.first()
        if not config:
            config = StatutoryConfig.objects.create()
        return Response(StatutoryConfigSerializer(config).data)

    def create(self, request, *args, **kwargs):
        if not is_hr_or_admin(request.user):
            return Response({'error': 'Only HR/Admin can update statutory settings.'}, status=status.HTTP_403_FORBIDDEN)
        config = StatutoryConfig.objects.first() or StatutoryConfig()
        serializer = StatutoryConfigSerializer(config, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class ProfessionalTaxSlabViewSet(viewsets.ModelViewSet):
    queryset = ProfessionalTaxSlab.objects.all()
    serializer_class = ProfessionalTaxSlabSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        if not is_hr_or_admin(self.request.user):
            raise permissions.PermissionDenied("Only HR/Admin can manage PT slabs.")
        serializer.save()


class EmployeeLoanViewSet(viewsets.ModelViewSet):
    queryset = EmployeeLoan.objects.all()
    serializer_class = EmployeeLoanSerializer
    permission_classes = [permissions.IsAuthenticated]


class ReimbursementClaimViewSet(viewsets.ModelViewSet):
    queryset = ReimbursementClaim.objects.all()
    serializer_class = ReimbursementClaimSerializer
    permission_classes = [permissions.IsAuthenticated]



# ---- Helpers ----

def _get_lop_days(emp, year, month):
    """Get LOP days for an employee in a given month from approved leave applications."""
    try:
        from django.db.models import Q
        lop_leaves = LeaveApplication.objects.filter(
            employee=emp,
            status='approved',
            start_date__year=year,
            start_date__month=month,
        ).filter(
            Q(leave_type__code__iexact='LOP') |
            Q(leave_type__code__iexact='UNPAID') |
            Q(leave_type__code__iexact='LWP') |
            Q(leave_type__code__iexact='UL') |
            Q(leave_type__name__icontains='unpaid') |
            Q(leave_type__name__icontains='loss')
        )
        return sum([Decimal(str(l.number_of_days)) for l in lop_leaves], Decimal('0'))
    except Exception:
        return Decimal('0')


def _prorate(working_days, lop_days):
    """Return the prorate factor given working days and LOP days."""
    if working_days <= 0:
        return Decimal('1')
    factor = (working_days - lop_days) / working_days
    return max(factor, Decimal('0'))
