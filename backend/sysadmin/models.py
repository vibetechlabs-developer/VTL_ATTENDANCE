from django.db import models

from core.constants import HRMS_MODULES
from users.models import User


class RoleModulePermission(models.Model):
    """Granular View/Add/Edit/Delete per HRMS module, keyed by User.role (SYS-02)."""

    role = models.CharField(max_length=20, choices=User.ROLE_CHOICES)
    module = models.CharField(max_length=50, choices=HRMS_MODULES)
    can_view = models.BooleanField(default=False)
    can_add = models.BooleanField(default=False)
    can_edit = models.BooleanField(default=False)
    can_delete = models.BooleanField(default=False)

    class Meta:
        unique_together = [('role', 'module')]
        ordering = ['role', 'module']
        verbose_name = 'Role module permission'
        verbose_name_plural = 'Role module permissions'

    def __str__(self):
        flags = []
        if self.can_view:
            flags.append('V')
        if self.can_add:
            flags.append('A')
        if self.can_edit:
            flags.append('E')
        if self.can_delete:
            flags.append('D')
        return f'{self.role}:{self.module} [{"".join(flags) or "-"}]'

class Role(models.Model):
    name = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True)

    class Meta:
        db_table = 'sysadmin_role'
        ordering = ['name']
        verbose_name = 'Role'
        verbose_name_plural = 'Roles'

    def __str__(self):
        return self.name


class Permission(models.Model):
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name='permissions')
    module = models.CharField(max_length=50)
    can_view = models.BooleanField(default=False)
    can_add = models.BooleanField(default=False)
    can_edit = models.BooleanField(default=False)
    can_delete = models.BooleanField(default=False)

    class Meta:
        db_table = 'sysadmin_permission'
        unique_together = [('role', 'module')]
        ordering = ['role', 'module']
        verbose_name = 'Permission'
        verbose_name_plural = 'Permissions'

    def __str__(self):
        perms = []
        if self.can_view: perms.append('V')
        if self.can_add: perms.append('A')
        if self.can_edit: perms.append('E')
        if self.can_delete: perms.append('D')
        return f"{self.role.name}:{self.module}[{''.join(perms) or '-'}]"


class Notification(models.Model):
    recipient = models.ForeignKey(
        'users.Employee',
        on_delete=models.CASCADE,
        related_name='notifications'
    )
    event_type = models.CharField(max_length=100, help_text='Free-text code e.g. "leave_approved"')
    title = models.CharField(max_length=200)
    body = models.TextField()
    is_read = models.BooleanField(default=False)
    created_on = models.DateTimeField(auto_now_add=True)
    related_object_type = models.CharField(max_length=100, blank=True)
    related_object_id = models.IntegerField(null=True, blank=True)

    class Meta:
        db_table = 'sysadmin_notification'
        ordering = ['-created_on']

    def __str__(self):
        return f"[{self.event_type}] → {self.recipient.name}: {self.title}"


class AuditLog(models.Model):
    actor = models.ForeignKey(
        'users.Employee',
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
        db_table = 'sysadmin_auditlog'
        ordering = ['-timestamp']

    def __str__(self):
        actor_name = self.actor.name if self.actor else 'System'
        return f"{self.timestamp:%Y-%m-%d %H:%M} | {actor_name} | {self.action} | {self.module}"
