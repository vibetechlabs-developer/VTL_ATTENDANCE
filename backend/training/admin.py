from django.contrib import admin
from .models import TrainingProgram, TrainingEnrollment


@admin.register(TrainingProgram)
class TrainingProgramAdmin(admin.ModelAdmin):
    list_display = ('id', 'title', 'trainer_name', 'mode', 'scheduled_date', 'duration_hours', 'target_department', 'max_participants')
    list_filter = ('mode', 'target_department')
    search_fields = ('title', 'trainer_name', 'target_department')


@admin.register(TrainingEnrollment)
class TrainingEnrollmentAdmin(admin.ModelAdmin):
    list_display = ('id', 'program', 'employee', 'attended', 'feedback_rating', 'enrolled_on')
    list_filter = ('attended', 'program')
    search_fields = ('employee__name', 'program__title')
