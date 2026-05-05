from django.contrib import admin
from .models import AttendanceLog, BreakLog

admin.site.register(AttendanceLog)
admin.site.register(BreakLog)