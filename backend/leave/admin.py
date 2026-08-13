from django.contrib import admin
from .models import LeaveType, LeaveBalance, LeaveApplication, Holiday


@admin.register(LeaveType)
class LeaveTypeAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'code', 'annual_quota', 'accrual_frequency', 'requires_approval')
    search_fields = ('name', 'code')


@admin.register(LeaveBalance)
class LeaveBalanceAdmin(admin.ModelAdmin):
    list_display = ('id', 'employee', 'leave_type', 'year', 'allocated', 'used', 'balance')
    list_filter = ('year', 'leave_type')
    search_fields = ('employee__name',)


@admin.register(LeaveApplication)
class LeaveApplicationAdmin(admin.ModelAdmin):
    list_display = ('id', 'employee', 'leave_type', 'start_date', 'end_date', 'number_of_days', 'status', 'applied_on')
    list_filter = ('status', 'leave_type')
    search_fields = ('employee__name', 'reason')


@admin.register(Holiday)
class HolidayAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'date', 'location')
    list_filter = ('location',)
    search_fields = ('name',)
