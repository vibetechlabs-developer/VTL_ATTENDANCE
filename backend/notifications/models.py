from django.db import models
from users.models import Employee


class Notification(models.Model):
    recipient = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name='notifications'
    )
    event_type = models.CharField(
        max_length=100,
        help_text='Free-text event code e.g. "leave_approved", "task_assigned"'
    )
    title = models.CharField(max_length=200)
    body = models.TextField()
    is_read = models.BooleanField(default=False)
    created_on = models.DateTimeField(auto_now_add=True)
    related_object_type = models.CharField(max_length=100, blank=True)
    related_object_id = models.IntegerField(null=True, blank=True)

    class Meta:
        db_table = 'notifications_notification'
        ordering = ['-created_on']

    def __str__(self):
        return f"[{self.event_type}] → {self.recipient.name}: {self.title}"


class AuditLog(models.Model):
    actor = models.ForeignKey(
        Employee,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='audit_logs'
    )
    action = models.CharField(max_length=200)
    module = models.CharField(max_length=50)
    object_repr = models.CharField(max_length=500)
    timestamp = models.DateTimeField(auto_now_add=True)
    ip_address = models.CharField(max_length=50, blank=True, null=True)

    class Meta:
        db_table = 'notifications_auditlog'
        ordering = ['-timestamp']

    def __str__(self):
        actor_name = self.actor.name if self.actor else 'System'
        return f"{self.timestamp:%Y-%m-%d %H:%M} | {actor_name} | {self.action} | {self.module}"
