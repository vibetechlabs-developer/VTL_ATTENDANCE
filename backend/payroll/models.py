from decimal import Decimal
from django.db import models
from django.core.validators import MinValueValidator
from users.models import Employee


class SalaryComponent(models.Model):
    COMPONENT_TYPES = [
        ('earning', 'Earning'),
        ('deduction', 'Deduction'),
    ]
    CALCULATION_TYPES = [
        ('fixed', 'Fixed'),
        ('percentage', 'Percentage'),
    ]
    name = models.CharField(max_length=100)
    component_type = models.CharField(max_length=10, choices=COMPONENT_TYPES)
    calculation_type = models.CharField(max_length=10, choices=CALCULATION_TYPES)
    percentage_of = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL, related_name='percentage_components')

    class Meta:
        db_table = 'payroll_salarycomponent'
        verbose_name = 'Salary Component'
        verbose_name_plural = 'Salary Components'

    def __str__(self):
        return self.name


class AttendanceSummary(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='attendance_summaries')
    month = models.PositiveSmallIntegerField(validators=[MinValueValidator(1)])
    year = models.PositiveIntegerField()
    total_days_in_month = models.PositiveSmallIntegerField()
    present_days = models.PositiveSmallIntegerField()
    paid_leave_days = models.PositiveSmallIntegerField()
    unpaid_leave_days = models.PositiveSmallIntegerField()
    holidays = models.PositiveSmallIntegerField()
    weekly_offs = models.PositiveSmallIntegerField()

    class Meta:
        db_table = 'payroll_attendance_summary'
        unique_together = ('employee', 'month', 'year')

    def __str__(self):
        return f"Attendance {self.employee.name} - {self.month}/{self.year}"


class SalaryStructure(models.Model):
    employee = models.OneToOneField(Employee, on_delete=models.CASCADE, related_name='salary_structure')
    effective_from = models.DateField()

    class Meta:
        db_table = 'payroll_salarystructure'
        verbose_name = 'Salary Structure'
        verbose_name_plural = 'Salary Structures'

    def __str__(self):
        return f"{self.employee.name} - Structure"


class SalaryStructureComponent(models.Model):
    salary_structure = models.ForeignKey(SalaryStructure, on_delete=models.CASCADE, related_name='components')
    component = models.ForeignKey(SalaryComponent, on_delete=models.CASCADE, related_name='structure_components')
    value = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])

    class Meta:
        db_table = 'payroll_salarystructurecomponent'
        verbose_name = 'Salary Structure Component'
        verbose_name_plural = 'Salary Structure Components'
        unique_together = ('salary_structure', 'component')

    def __str__(self):
        return f"{self.salary_structure.employee.name} - {self.component.name}" 


class PayrollRun(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('finalized', 'Finalized'),
        ('locked', 'Locked'),
    ]
    month = models.PositiveSmallIntegerField(validators=[MinValueValidator(1)])
    year = models.PositiveIntegerField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='draft')
    generated_on = models.DateTimeField(auto_now_add=True)
    generated_by = models.ForeignKey(Employee, on_delete=models.SET_NULL, null=True, related_name='generated_payroll_runs')

    class Meta:
        db_table = 'payroll_payrollrun'
        verbose_name = 'Payroll Run'
        verbose_name_plural = 'Payroll Runs'
        unique_together = ('month', 'year')

    def __str__(self):
        return f"Payroll {self.month}/{self.year} ({self.status})"


class CompanyPayrollPolicy(models.Model):
    BASIC_PERCENT = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('40.00'))
    HRA_PERCENT_METRO = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('20.00'))
    HRA_PERCENT_NON_METRO = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('15.00'))
    LOP_CALCULATION_BASIS_CHOICES = [
        ('calendar', 'Calendar Days'),
        ('working', 'Working Days'),
    ]
    lop_calculation_basis = models.CharField(max_length=10, choices=LOP_CALCULATION_BASIS_CHOICES, default='working')
    rounding_rule = models.CharField(max_length=20, default='nearest')  # could be 'up', 'down', 'nearest'
    class Meta:
        db_table = 'payroll_companypolicy'
        verbose_name = 'Company Payroll Policy'
        verbose_name_plural = 'Company Payroll Policies'
    def __str__(self):
        return "Company Payroll Policy"

class StatutoryConfig(models.Model):
    pf_rate_employee = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('12.00'))
    pf_rate_employer = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('12.00'))
    pf_ceiling = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('150000'))
    esi_rate_employee = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0.75'))
    esi_rate_employer = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('3.25'))
    professional_tax_slabs = models.JSONField(default=dict)  # e.g., {"2023": 200, "2024": 250}
    tds_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('10.00'))
    class Meta:
        db_table = 'payroll_statutoryconfig'
        verbose_name = 'Statutory Config'
        verbose_name_plural = 'Statutory Configs'
    def __str__(self):
        return "Statutory Config"

class ProfessionalTaxSlab(models.Model):
    state = models.CharField(max_length=50)
    min_gross_salary = models.DecimalField(max_digits=12, decimal_places=2)
    max_gross_salary = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    monthly_pt_amount = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        db_table = 'payroll_professionaltaxslab'
        verbose_name = 'Professional Tax Slab'
        verbose_name_plural = 'Professional Tax Slabs'
        unique_together = ('state', 'min_gross_salary', 'max_gross_salary')

    def __str__(self):
        max_sal = self.max_gross_salary if self.max_gross_salary is not None else '∞'
        return f"{self.state}: {self.min_gross_salary}-{max_sal} => {self.monthly_pt_amount}"

class EmployeeLoan(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='loans')
    principal_amount = models.DecimalField(max_digits=12, decimal_places=2)
    monthly_emi = models.DecimalField(max_digits=12, decimal_places=2)
    tenure_months = models.PositiveIntegerField()
    disbursed_date = models.DateField()
    STATUS_CHOICES = [
        ('ACTIVE', 'Active'),
        ('CLOSED', 'Closed'),
    ]
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='ACTIVE')
    remaining_balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        db_table = 'payroll_employeeloan'
        verbose_name = 'Employee Loan'
        verbose_name_plural = 'Employee Loans'

    def __str__(self):
        return f"Loan {self.id} for {self.employee.name}"

class LoanRepaymentSchedule(models.Model):
    loan = models.ForeignKey(EmployeeLoan, on_delete=models.CASCADE, related_name='repayment_schedule')
    due_month = models.CharField(max_length=7)  # YYYY-MM
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    paid = models.BooleanField(default=False)
    paid_in_payroll_run = models.ForeignKey('PayrollRun', null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        db_table = 'payroll_loanrepaymentschedule'
        verbose_name = 'Loan Repayment Schedule'
        verbose_name_plural = 'Loan Repayment Schedules'
        unique_together = ('loan', 'due_month')

    def __str__(self):
        return f"Loan {self.loan.id} due {self.due_month}"

class ReimbursementClaim(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='reimbursements')
    category = models.CharField(max_length=100)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    receipt_file = models.FileField(upload_to='reimbursements/', null=True, blank=True)
    claim_date = models.DateField()
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
        ('PAID', 'Paid'),
    ]
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='PENDING')
    approved_by = models.ForeignKey('users.Employee', null=True, blank=True, related_name='approved_claims', on_delete=models.SET_NULL)
    paid_in_payroll_run = models.ForeignKey('PayrollRun', null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        db_table = 'payroll_reimbursementclaim'
        verbose_name = 'Reimbursement Claim'
        verbose_name_plural = 'Reimbursement Claims'

    def __str__(self):
        return f"{self.employee.name} - {self.category} - {self.amount}"

class PayrollRevision(models.Model):
    payroll_run = models.ForeignKey('PayrollRun', on_delete=models.CASCADE, related_name='revisions')
    payslip = models.ForeignKey('Payslip', on_delete=models.CASCADE, related_name='revisions')
    revised_by = models.ForeignKey('users.Employee', on_delete=models.SET_NULL, null=True)
    reason = models.TextField()
    old_values = models.JSONField()
    new_values = models.JSONField()
    revised_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'payroll_revision'
        verbose_name = 'Payroll Revision'
        verbose_name_plural = 'Payroll Revisions'

    def __str__(self):
        return f"Revision of payslip {self.payslip.id} in run {self.payroll_run.id}"

class PayrollRevisionLog(models.Model):
    payslip = models.ForeignKey('Payslip', on_delete=models.CASCADE, related_name='revision_logs')
    performed_by = models.ForeignKey('users.Employee', on_delete=models.SET_NULL, null=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    change_reason = models.CharField(max_length=255, blank=True)
    before_snapshot = models.JSONField()
    after_snapshot = models.JSONField()
    class Meta:
        db_table = 'payroll_revisionlog'
        verbose_name = 'Payroll Revision Log'
        verbose_name_plural = 'Payroll Revision Logs'
    def __str__(self):
        return f"Revision on {self.payslip.id} by {self.performed_by_id}"

# Extend Payslip with new fields (YTD, employer contributions, net pay in words, lop amount)
class Payslip(models.Model):
    payroll_run = models.ForeignKey(PayrollRun, on_delete=models.CASCADE, related_name='payslips')
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='payslips')
    gross_earnings = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_deductions = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    net_pay = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    lop_days = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    lop_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    employer_pf = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    employer_esi = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    employer_gratuity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    ytd_gross = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    ytd_pf = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    ytd_tds = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    ytd_prof_tax = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    net_pay_in_words = models.CharField(max_length=255, blank=True)
    breakdown = models.JSONField(default=dict, blank=True)
    pdf_path = models.CharField(max_length=255, blank=True, null=True)
    generated_on = models.DateTimeField(auto_now_add=True)
    class Meta:
        db_table = 'payroll_payslip'
        verbose_name = 'Payslip'
        verbose_name_plural = 'Payslips'
        unique_together = ('payroll_run', 'employee')
    def __str__(self):
        return f"Payslip for {self.employee.name} - {self.payroll_run.month}/{self.payroll_run.year}"

