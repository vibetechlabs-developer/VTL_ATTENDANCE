from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
    ROLE_CHOICES = [
        ('employee', 'Employee'),
        ('manager', 'Manager'),
        ('hr', 'HR'),
        ('sales', 'Sales'),
        ('admin', 'Admin'),
    ]
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='employee')
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    def __str__(self):
        return self.email

    groups = models.ManyToManyField(
        'auth.Group',
        related_name='custom_user_set',
        blank=True
    )
    
    user_permissions = models.ManyToManyField(
        'auth.Permission',
        related_name='custom_user_permissions_set',
        blank=True
    )

class Employee(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    # Primary manager (first selected); kept for backward-compatible queries.
    manager = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='managed_employees')
    # All reporting managers (multi-select in admin UI).
    managers = models.ManyToManyField(User, blank=True, related_name='managed_team_members')
    name = models.CharField(max_length=100)
    department = models.CharField(max_length=100)
    phone = models.CharField(max_length=15, blank=True)
    face_encoding = models.JSONField(null=True, blank=True)
    profile_photo = models.ImageField(upload_to='photos/', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name
    
   

class OfficeLocation(models.Model):
    name = models.CharField(max_length=100)
    latitude = models.FloatField()
    longitude = models.FloatField()
    radius_meters = models.IntegerField(default=100)

    def __str__(self):
        return self.name


class PushSubscription(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='push_subscriptions')
    endpoint = models.TextField(unique=True)
    p256dh = models.TextField()
    auth = models.TextField()
    user_agent = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"PushSubscription<{self.user.email}>"


class Appraisal(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='appraisals')
    given_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='appraisals_given'
    )
    rating = models.PositiveSmallIntegerField(default=5)
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Appraisal<{self.employee.name}>"


class AppNotification(models.Model):
    TYPE_CHOICES = [
        ('info', 'Info'),
        ('success', 'Success'),
        ('warning', 'Warning'),
    ]
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    title = models.CharField(max_length=120)
    body = models.TextField()
    type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='info')
    read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Notification<{self.user.email}:{self.title}>"