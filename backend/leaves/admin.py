from django.contrib import admin
from .models import LeaveRequest, LeaveBalance


@admin.register(LeaveBalance)
class LeaveBalanceAdmin(admin.ModelAdmin):
    list_display = (
        "employee",
        "year",
        "casual_total",
        "casual_used",
        "sick_total",
        "sick_used",
        "earned_total",
        "earned_used",
        "pl_carried_forward",
    )
    search_fields = ("employee__name", "employee__user__email")


admin.site.register(LeaveRequest)