from django.db import models
from users.models import Employee, User  # ← users thi import

class LeaveBalance(models.Model):
    employee = models.OneToOneField(Employee, on_delete=models.CASCADE)
    casual_total = models.IntegerField(default=12)
    casual_used = models.IntegerField(default=0)
    sick_total = models.IntegerField(default=10)
    sick_used = models.IntegerField(default=0)
    earned_total = models.IntegerField(default=15)
    earned_used = models.IntegerField(default=0)

    def __str__(self):
        return f"Balance - {self.employee.name}"


class LeaveRequest(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]
    LEAVE_TYPES = [
        ('casual', 'Casual'),
        ('sick', 'Sick'),
        ('earned', 'Earned'),
    ]
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE)
    leave_type = models.CharField(max_length=20, choices=LEAVE_TYPES)
    start_date = models.DateField()
    end_date = models.DateField()
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