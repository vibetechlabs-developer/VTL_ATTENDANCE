from django.contrib import admin
from .models import AttendanceLog, BreakLog, CallLog

admin.site.register(AttendanceLog)
admin.site.register(BreakLog)
admin.site.register(CallLog)