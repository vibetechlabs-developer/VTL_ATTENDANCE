from rest_framework import serializers
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


class SalaryComponentSerializer(serializers.ModelSerializer):
    percentage_of_name = serializers.ReadOnlyField(source='percentage_of.name')

    class Meta:
        model = SalaryComponent
        fields = ['id', 'name', 'component_type', 'calculation_type', 'percentage_of', 'percentage_of_name']


class SalaryStructureComponentSerializer(serializers.ModelSerializer):
    component_name = serializers.ReadOnlyField(source='component.name')
    component_type = serializers.ReadOnlyField(source='component.component_type')
    calculation_type = serializers.ReadOnlyField(source='component.calculation_type')

    class Meta:
        model = SalaryStructureComponent
        fields = ['id', 'component', 'component_name', 'component_type', 'calculation_type', 'value']


class SalaryStructureSerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.name')
    employee_designation = serializers.ReadOnlyField(source='employee.designation')
    employee_department = serializers.ReadOnlyField(source='employee.department')
    components = SalaryStructureComponentSerializer(many=True, read_only=True)

    class Meta:
        model = SalaryStructure
        fields = [
            'id', 'employee', 'employee_name', 'employee_designation',
            'employee_department', 'effective_from', 'components'
        ]


class PayrollRunSerializer(serializers.ModelSerializer):
    generated_by_name = serializers.ReadOnlyField(source='generated_by.name')
    payslips_count = serializers.IntegerField(source='payslips.count', read_only=True)

    class Meta:
        model = PayrollRun
        fields = ['id', 'month', 'year', 'status', 'generated_on', 'generated_by', 'generated_by_name', 'payslips_count']
        read_only_fields = ['generated_on', 'generated_by', 'status']


class PayslipSerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.name')
    employee_designation = serializers.ReadOnlyField(source='employee.designation')
    employee_department = serializers.ReadOnlyField(source='employee.department')
    # Mask bank account number, show only last 4 digits
    employee_bank_account = serializers.SerializerMethodField()
    employee_bank_name = serializers.ReadOnlyField(source='employee.bank_name')
    employee_pan = serializers.ReadOnlyField(source='employee.pan_number')
    month = serializers.ReadOnlyField(source='payroll_run.month')
    year = serializers.ReadOnlyField(source='payroll_run.year')
    payroll_status = serializers.ReadOnlyField(source='payroll_run.status')
    # New fields
    lop_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    employer_pf = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    employer_esi = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    employer_gratuity = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    ytd_gross = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    ytd_pf = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    ytd_tds = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    ytd_prof_tax = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    net_pay_in_words = serializers.CharField(read_only=True)

    def get_employee_bank_account(self, obj):
        acct = getattr(obj.employee, 'bank_account_number', '') or ''
        if len(acct) <= 4:
            return acct
        return f"{'*' * (len(acct) - 4)}{acct[-4:]}"

    class Meta:
        model = Payslip
        fields = [
            'id', 'payroll_run', 'month', 'year', 'payroll_status',
            'employee', 'employee_name', 'employee_designation', 'employee_department',
            'employee_bank_account', 'employee_bank_name', 'employee_pan',
            'gross_earnings', 'total_deductions', 'net_pay', 'lop_days', 'lop_amount',
            'employer_pf', 'employer_esi', 'employer_gratuity',
            'ytd_gross', 'ytd_pf', 'ytd_tds', 'ytd_prof_tax',
            'net_pay_in_words',
            'breakdown', 'generated_on', 'pdf_path'
        ]
        read_only_fields = [
            'gross_earnings', 'total_deductions', 'net_pay', 'lop_days', 'lop_amount',
            'employer_pf', 'employer_esi', 'employer_gratuity',
            'ytd_gross', 'ytd_pf', 'ytd_tds', 'ytd_prof_tax',
            'net_pay_in_words', 'generated_on'
        ]


class CompanyPayrollPolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = CompanyPayrollPolicy
        fields = '__all__'


class StatutoryConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = StatutoryConfig
        fields = '__all__'


class ProfessionalTaxSlabSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProfessionalTaxSlab
        fields = '__all__'


class LoanRepaymentScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoanRepaymentSchedule
        fields = '__all__'


class EmployeeLoanSerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.name')
    repayment_schedule = LoanRepaymentScheduleSerializer(many=True, read_only=True)

    class Meta:
        model = EmployeeLoan
        fields = ['id', 'employee', 'employee_name', 'principal_amount', 'monthly_emi', 'tenure_months', 'disbursed_date', 'status', 'remaining_balance', 'repayment_schedule']


class ReimbursementClaimSerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.name')
    approved_by_name = serializers.ReadOnlyField(source='approved_by.name')

    class Meta:
        model = ReimbursementClaim
        fields = ['id', 'employee', 'employee_name', 'category', 'amount', 'receipt_file', 'claim_date', 'status', 'approved_by', 'approved_by_name', 'paid_in_payroll_run']


class PayrollRevisionSerializer(serializers.ModelSerializer):
    revised_by_name = serializers.ReadOnlyField(source='revised_by.name')

    class Meta:
        model = PayrollRevision
        fields = ['id', 'payroll_run', 'payslip', 'revised_by', 'revised_by_name', 'reason', 'old_values', 'new_values', 'revised_at']

