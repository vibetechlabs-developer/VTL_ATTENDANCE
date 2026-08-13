from django.contrib import admin
from .models import Resignation, ClearanceChecklistItem, ExitInterview


class ClearanceChecklistItemInline(admin.TabularInline):
    model = ClearanceChecklistItem
    extra = 0


@admin.register(Resignation)
class ResignationAdmin(admin.ModelAdmin):
    list_display = ('id', 'employee', 'submitted_on', 'proposed_last_working_day', 'approved_last_working_day', 'status')
    list_filter = ('status',)
    search_fields = ('employee__name', 'reason')
    inlines = [ClearanceChecklistItemInline]


@admin.register(ClearanceChecklistItem)
class ClearanceChecklistItemAdmin(admin.ModelAdmin):
    list_display = ('id', 'resignation', 'department', 'item_description', 'status', 'cleared_by', 'cleared_on')
    list_filter = ('department', 'status')
    search_fields = ('resignation__employee__name', 'item_description')


@admin.register(ExitInterview)
class ExitInterviewAdmin(admin.ModelAdmin):
    list_display = ('id', 'resignation', 'conducted_by', 'conducted_on', 'satisfaction_score')
    search_fields = ('resignation__employee__name', 'reason_for_leaving')
