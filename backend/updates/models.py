from django.db import models
from django.contrib.auth import get_user_model
from django.utils import timezone
from users.models import Employee

User = get_user_model()



class DailyUpdate(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE)
    date = models.DateField(auto_now_add=True)
    update_text = models.TextField()
    report_data = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Update - {self.employee.name} - {self.date}"


class Task(models.Model):
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
        ('urgent', 'Urgent'),
    ]

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('reviewed', 'Reviewed'),
        ('reopened', 'Revision Requested'),
        ('cancelled', 'Cancelled'),
    ]

    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    assigned_to = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='assigned_tasks')
    assigned_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='created_tasks')
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='medium')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    due_datetime = models.DateTimeField()
    completion_notes = models.TextField(blank=True, default='')
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Task<{self.title}> -> {self.assigned_to.name}"

    @property
    def is_overdue(self):
        if self.status in ['completed', 'reviewed', 'cancelled']:
            return False
        if not self.due_datetime:
            return False
        due_dt = self.due_datetime
        if isinstance(due_dt, str):
            from django.utils.dateparse import parse_datetime
            due_dt = parse_datetime(due_dt)
        if not due_dt:
            return False
        return timezone.now() > due_dt