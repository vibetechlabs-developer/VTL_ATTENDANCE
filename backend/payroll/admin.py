from django.contrib import admin
from .models import (
    SalaryComponent,
    SalaryStructure,
    SalaryStructureComponent,
    PayrollRun,
    Payslip
)


@admin.register(SalaryComponent)
class SalaryComponentAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'component_type', 'calculation_type', 'percentage_of')
    list_filter = ('component_type', 'calculation_type')
    search_fields = ('name',)


class SalaryStructureComponentInline(admin.TabularInline):
    model = SalaryStructureComponent
    extra = 1


@admin.register(SalaryStructure)
class SalaryStructureAdmin(admin.ModelAdmin):
    list_display = ('id', 'employee', 'effective_from')
    search_fields = ('employee__name',)
    inlines = [SalaryStructureComponentInline]


@admin.register(PayrollRun)
class PayrollRunAdmin(admin.ModelAdmin):
    list_display = ('id', 'month', 'year', 'status', 'generated_by', 'generated_on')
    list_filter = ('status', 'year', 'month')


@admin.register(Payslip)
class PayslipAdmin(admin.ModelAdmin):
    list_display = ('id', 'payroll_run', 'employee', 'gross_earnings', 'total_deductions', 'net_pay', 'lop_days')
    list_filter = ('payroll_run__year', 'payroll_run__month')
    search_fields = ('employee__name',)
