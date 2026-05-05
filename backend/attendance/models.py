from django.db import models
from users.models import Employee  # ← users app thi import

class AttendanceLog(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE)
    date = models.DateField(auto_now_add=True)
    check_in = models.DateTimeField(null=True, blank=True)
    check_out = models.DateTimeField(null=True, blank=True)
    check_in_lat = models.FloatField(null=True, blank=True)
    check_in_lng = models.FloatField(null=True, blank=True)
    break_minutes = models.IntegerField(default=0)
    total_hours = models.FloatField(default=0)
    overtime_hours = models.FloatField(default=0)
    status = models.CharField(max_length=20, default='present')

    def __str__(self):
        return f"{self.employee.name} - {self.date}"


class BreakLog(models.Model):
    attendance = models.ForeignKey(AttendanceLog, on_delete=models.CASCADE)
    break_start = models.DateTimeField()
    break_end = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Break - {self.attendance.employee.name}"