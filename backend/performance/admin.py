from django.contrib import admin
from .models import AppraisalCycle, Goal, Appraisal


@admin.register(AppraisalCycle)
class AppraisalCycleAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'start_date', 'end_date', 'status')
    list_filter = ('status',)
    search_fields = ('name',)


@admin.register(Goal)
class GoalAdmin(admin.ModelAdmin):
    list_display = ('id', 'cycle', 'employee', 'title', 'weightage', 'self_rating', 'manager_rating')
    list_filter = ('cycle', 'employee__department')
    search_fields = ('employee__name', 'title', 'description')


@admin.register(Appraisal)
class AppraisalAdmin(admin.ModelAdmin):
    list_display = ('id', 'cycle', 'employee', 'overall_rating', 'status', 'finalized_by', 'finalized_on')
    list_filter = ('status', 'cycle')
    search_fields = ('employee__name', 'cycle__name')
