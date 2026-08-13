from django.db import models
from users.models import Employee

# Constant list of sensitive employee fields requiring HR approval for profile changes
SENSITIVE_FIELDS = [
    'bank_account_number',
    'bank_name',
    'ifsc_code',
    'pan_number',
    'aadhaar_number',
    'salary',
    'grade',
]

# All fields allowed for ProfileChangeRequest
ALLOWED_CHANGE_FIELDS = SENSITIVE_FIELDS + [
    'phone',
    'address',
    'designation',
    'name',
]


class ProfileChangeRequest(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name='profile_change_requests'
    )
    field_name = models.CharField(max_length=100)
    old_value = models.TextField(blank=True)
    requested_value = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    requested_on = models.DateTimeField(auto_now_add=True)
    reviewed_by = models.ForeignKey(
        Employee,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='reviewed_profile_changes'
    )
    reviewed_on = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'ess_profilechangerequest'
        verbose_name = 'Profile Change Request'
        verbose_name_plural = 'Profile Change Requests'
        ordering = ['-requested_on']

    def __str__(self):
        return f"{self.employee.name} - Request change {self.field_name} ({self.status})"


class HRTicket(models.Model):
    CATEGORY_CHOICES = [
        ('General', 'General'),
        ('Payroll', 'Payroll'),
        ('Attendance', 'Attendance / Leaves'),
        ('IT', 'IT Support'),
        ('Policy', 'Policy / HR'),
        ('Facilities', 'Facilities'),
        ('Grievance', 'Grievance'),
        ('Other', 'Other'),
        ('payroll', 'Payroll'),
        ('attendance', 'Attendance'),
        ('it_support', 'IT Support'),
        ('policy', 'Policy'),
        ('other', 'Other'),
    ]
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
    ]
    STATUS_CHOICES = [
        ('open', 'Open'),
        ('in_progress', 'In Progress'),
        ('resolved', 'Resolved'),
    ]

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name='hr_tickets'
    )
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES, default='General')
    subject = models.CharField(max_length=200)
    description = models.TextField()
    attachment = models.FileField(upload_to='hr_tickets/', null=True, blank=True)
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='medium')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    created_on = models.DateTimeField(auto_now_add=True)
    resolved_on = models.DateTimeField(null=True, blank=True)
    assigned_to = models.ForeignKey(
        Employee,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='assigned_hr_tickets'
    )

    class Meta:
        db_table = 'ess_hrticket'
        verbose_name = 'HR Ticket'
        verbose_name_plural = 'HR Tickets'
        ordering = ['-created_on']

    def __str__(self):
        return f"Ticket #{self.id}: {self.subject} ({self.status})"


class TicketComment(models.Model):
    ticket = models.ForeignKey(
        HRTicket,
        on_delete=models.CASCADE,
        related_name='comments'
    )
    author = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name='ticket_comments'
    )
    text = models.TextField()
    created_on = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'ess_ticketcomment'
        verbose_name = 'Ticket Comment'
        verbose_name_plural = 'Ticket Comments'
        ordering = ['created_on']

    def __str__(self):
        return f"Comment by {self.author.name} on Ticket #{self.ticket.id}"
