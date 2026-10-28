from django.db import models
from django.utils import timezone
from users.models import Employee, User  # ← users thi import


def _current_year():
    return timezone.now().year


class LeaveBalance(models.Model):
    employee = models.OneToOneField(Employee, on_delete=models.CASCADE)
    year = models.PositiveIntegerField(default=_current_year)
    casual_total = models.DecimalField(max_digits=5, decimal_places=1, default=10)
    casual_used = models.DecimalField(max_digits=5, decimal_places=1, default=0)
    sick_total = models.DecimalField(max_digits=5, decimal_places=1, default=10)
    sick_used = models.DecimalField(max_digits=5, decimal_places=1, default=0)
    earned_total = models.DecimalField(max_digits=5, decimal_places=1, default=15)
    earned_used = models.DecimalField(max_digits=5, decimal_places=1, default=0)
    pl_carried_forward = models.DecimalField(max_digits=5, decimal_places=1, default=0)

    def __str__(self):
        return f"Balance - {self.employee.name} ({self.year})"


class LeaveRequest(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]
    LEAVE_TYPES = [
        ('casual', 'Casual'),
        ('sick', 'Sick'),
        ('earned', 'Paid'),
        ('exam', 'Exam'),
        ('college', 'College'),
        ('other', 'Other'),
    ]
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE)
    leave_type = models.CharField(max_length=20, choices=LEAVE_TYPES)
    start_date = models.DateField()
    end_date = models.DateField()
    is_half_day = models.BooleanField(default=False)
    reason = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    applied_at = models.DateTimeField(auto_now_add=True)
    reviewed_by = models.ForeignKey(
        User, null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='reviewed_leaves'
    )

    def __str__(self):
        return f"{self.employee.name} - {self.leave_type}"  