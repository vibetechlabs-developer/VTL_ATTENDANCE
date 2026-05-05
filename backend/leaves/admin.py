from django.contrib import admin
from .models import LeaveRequest,LeaveBalance

admin.site.register(LeaveRequest)
admin.site.register(LeaveBalance)