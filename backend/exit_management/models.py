from django.db import models
from users.models import Employee

DEFAULT_NOTICE_PERIOD_DAYS = 30

DEFAULT_CLEARANCE_ITEMS = [
    ('IT', 'Laptop and asset return'),
    ('IT', 'Email and VPN account deactivation'),
    ('Finance', 'Dues clearance & expense claims'),
    ('Finance', 'Full & Final settlement approval'),
    ('Admin', 'ID card & access card surrender'),
    ('Admin', 'Drawer/locker keys return'),
    ('HR', 'Exit interview completion'),
    ('HR', 'Service certificate & relieving letter issuance'),
]


class Resignation(models.Model):
    STATUS_CHOICES = [
        ('submitted', 'Submitted'),
        ('acknowledged', 'Acknowledged'),
        ('withdrawn', 'Withdrawn'),
        ('completed', 'Completed'),
    ]

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name='resignations'
    )
    submitted_on = models.DateTimeField(auto_now_add=True)
    notice_period_days = models.PositiveIntegerField(default=DEFAULT_NOTICE_PERIOD_DAYS)
    proposed_last_working_day = models.DateField()
    approved_last_working_day = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='submitted')
    reason = models.TextField(blank=True)

    class Meta:
        db_table = 'exit_management_resignation'
        verbose_name = 'Resignation'
        verbose_name_plural = 'Resignations'
        ordering = ['-submitted_on']

    def __str__(self):
        return f"Resignation - {self.employee.name} ({self.status})"


class ClearanceChecklistItem(models.Model):
    DEPARTMENT_CHOICES = [
        ('IT', 'IT'),
        ('Finance', 'Finance'),
        ('Admin', 'Admin'),
        ('HR', 'HR'),
    ]
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('done', 'Done'),
    ]

    resignation = models.ForeignKey(
        Resignation,
        on_delete=models.CASCADE,
        related_name='clearance_items'
    )
    department = models.CharField(max_length=20, choices=DEPARTMENT_CHOICES, default='IT')
    item_description = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    remark = models.TextField(blank=True)
    cleared_by = models.ForeignKey(
        Employee,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='cleared_exit_items'
    )
    cleared_on = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'exit_management_clearancechecklistitem'
        verbose_name = 'Clearance Checklist Item'
        verbose_name_plural = 'Clearance Checklist Items'

    def __str__(self):
        return f"[{self.department}] {self.item_description} - {self.status}"


class ExitInterview(models.Model):
    resignation = models.OneToOneField(
        Resignation,
        on_delete=models.CASCADE,
        related_name='exit_interview'
    )
    conducted_by = models.ForeignKey(
        Employee,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='conducted_exit_interviews'
    )
    conducted_on = models.DateField(null=True, blank=True)
    reason_for_leaving = models.TextField()
    satisfaction_score = models.IntegerField(null=True, blank=True, help_text='Score 1-5')
    comments = models.TextField(blank=True)

    class Meta:
        db_table = 'exit_management_exitinterview'
        verbose_name = 'Exit Interview'
        verbose_name_plural = 'Exit Interviews'

    def __str__(self):
        return f"Exit Interview for {self.resignation.employee.name}"
