from django.db import models
from users.models import Employee  # ← users app thi import

class AttendanceLog(models.Model):
    CHECKOUT_MODE_CHOICES = [
        ("office", "Office"),
        ("outside_client", "Outside Client Meeting"),
    ]

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
    checkout_mode = models.CharField(max_length=30, choices=CHECKOUT_MODE_CHOICES, default="office")
    checkout_note = models.TextField(blank=True, default="")

    def __str__(self):
        return f"{self.employee.name} - {self.date}"


class BreakLog(models.Model):
    attendance = models.ForeignKey(AttendanceLog, on_delete=models.CASCADE)
    break_start = models.DateTimeField()
    break_end = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Break - {self.attendance.employee.name}"


class CallLog(models.Model):
    """Sales on-phone time (pauses idle auto-break while active)."""
    attendance = models.ForeignKey(AttendanceLog, on_delete=models.CASCADE, related_name="call_logs")
    call_start = models.DateTimeField()
    call_end = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Call - {self.attendance.employee.name}"


class TaskInterruptionLog(models.Model):
    INTERRUPTION_CHOICES = [
        ('break', 'Break'),
        ('checkout', 'Check‑Out'),
    ]
    task = models.ForeignKey('updates.Task', on_delete=models.CASCADE, related_name='interruption_logs')
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='task_interruption_logs')
    interruption_type = models.CharField(max_length=10, choices=INTERRUPTION_CHOICES)
    triggered_at = models.DateTimeField(auto_now_add=True)
    reason = models.TextField()
    task_status_at_time = models.CharField(max_length=20)
    deadline_at_time = models.DateTimeField()

    def __str__(self):
        return f"{self.employee.name} – {self.interruption_type} – {self.task.title}"