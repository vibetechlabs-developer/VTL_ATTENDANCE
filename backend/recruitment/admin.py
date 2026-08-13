from django.contrib import admin
from .models import JobOpening, Candidate, Application, Interview


@admin.register(JobOpening)
class JobOpeningAdmin(admin.ModelAdmin):
    list_display = ('id', 'title', 'department', 'location', 'status', 'posted_by', 'posted_on', 'closing_date')
    list_filter = ('status', 'department', 'location')
    search_fields = ('title', 'department', 'description')


@admin.register(Candidate)
class CandidateAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'email', 'phone', 'source', 'created_on')
    search_fields = ('name', 'email', 'phone', 'source')


@admin.register(Application)
class ApplicationAdmin(admin.ModelAdmin):
    list_display = ('id', 'job_opening', 'candidate', 'stage', 'applied_on', 'updated_on')
    list_filter = ('stage', 'job_opening__department')
    search_fields = ('candidate__name', 'candidate__email', 'job_opening__title')


@admin.register(Interview)
class InterviewAdmin(admin.ModelAdmin):
    list_display = ('id', 'application', 'scheduled_on', 'mode', 'status', 'rating')
    list_filter = ('mode', 'status')
    search_fields = ('application__candidate__name', 'application__job_opening__title')
