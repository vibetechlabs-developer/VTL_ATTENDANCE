from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    SalaryComponentViewSet,
    SalaryStructureViewSet,
    PayrollRunViewSet,
    PayslipViewSet,
    CompanyPayrollPolicyViewSet,
    StatutoryConfigViewSet,
    ProfessionalTaxSlabViewSet,
    EmployeeLoanViewSet,
    ReimbursementClaimViewSet,
)

router = DefaultRouter()
router.register(r'salary-components', SalaryComponentViewSet, basename='salarycomponent')
router.register(r'salary-structures', SalaryStructureViewSet, basename='salarystructure')
router.register(r'payroll-runs', PayrollRunViewSet, basename='payrollrun')
router.register(r'payslips', PayslipViewSet, basename='payslip')
router.register(r'policy', CompanyPayrollPolicyViewSet, basename='payrollpolicy')
router.register(r'statutory-config', StatutoryConfigViewSet, basename='statutoryconfig')
router.register(r'pt-slabs', ProfessionalTaxSlabViewSet, basename='ptslab')
router.register(r'loans', EmployeeLoanViewSet, basename='employeeloan')
router.register(r'reimbursements', ReimbursementClaimViewSet, basename='reimbursementclaim')

urlpatterns = [
    path('', include(router.urls)),
]
