from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator
from users.models import Employee


class LeaveType(models.Model):
    ACCRUAL_FREQUENCIES = [
        ('monthly', 'Monthly'),
        ('yearly', 'Yearly'),
        ('none', 'None'),
    ]

    name = models.CharField(max_length=100)
    code = models.CharField(max_length=10, unique=True)
    annual_quota = models.DecimalField(max_digits=6, decimal_places=2, validators=[MinValueValidator(0)])
    accrual_frequency = models.CharField(max_length=10, choices=ACCRUAL_FREQUENCIES, default='none')
    carry_forward_limit = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True, help_text='null => unlimited')
    requires_approval = models.BooleanField(default=True)

    class Meta:
        db_table = 'leave_leavetype'
        verbose_name = 'Leave Type'
        verbose_name_plural = 'Leave Types'

    def __str__(self):
        return f"{self.name} ({self.code})"


class LeaveBalance(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='leave_balances')
    leave_type = models.ForeignKey(LeaveType, on_delete=models.CASCADE, related_name='balances')
    year = models.PositiveIntegerField()
    allocated = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    used = models.DecimalField(max_digits=6, decimal_places=2, default=0)

    class Meta:
        db_table = 'leave_leavebalance'
        unique_together = ('employee', 'leave_type', 'year')
        verbose_name = 'Leave Balance'
        verbose_name_plural = 'Leave Balances'

    @property
    def balance(self):
        return self.allocated - self.used

    def __str__(self):
        return f"{self.employee.name} - {self.leave_type.code} - {self.year}"


class LeaveApplication(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('cancelled', 'Cancelled'),
    ]
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='leave_applications')
    leave_type = models.ForeignKey(LeaveType, on_delete=models.CASCADE, related_name='applications')
    start_date = models.DateField()
    end_date = models.DateField()
    number_of_days = models.DecimalField(max_digits=5, decimal_places=2)
    reason = models.TextField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    applied_on = models.DateTimeField(auto_now_add=True)
    approved_by = models.ForeignKey(Employee, null=True, blank=True, on_delete=models.SET_NULL, related_name='approved_leaves')
    approved_on = models.DateTimeField(null=True, blank=True)
    manager_remark = models.TextField(blank=True)

    class Meta:
        db_table = 'leave_leaveapplication'
        verbose_name = 'Leave Application'
        verbose_name_plural = 'Leave Applications'
        ordering = ['-applied_on']

    def __str__(self):
        return f"{self.employee.name} - {self.leave_type.code} ({self.start_date} to {self.end_date})"


class Holiday(models.Model):
    name = models.CharField(max_length=100)
    date = models.DateField()
    location = models.CharField(max_length=100, blank=True, help_text='Blank applies to all locations')

    class Meta:
        db_table = 'leave_holiday'
        verbose_name = 'Holiday'
        verbose_name_plural = 'Holidays'
        unique_together = ('date', 'location')
        ordering = ['date']

    def __str__(self):
        return f"{self.name} on {self.date}"
