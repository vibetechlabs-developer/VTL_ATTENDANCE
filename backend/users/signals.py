import contextvars

from django.db import IntegrityError
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth import get_user_model

User = get_user_model()

# Serializer create path inserts Employee itself; skip the stub to avoid OneToOne clashes.
skip_auto_employee = contextvars.ContextVar("skip_auto_employee", default=False)


@receiver(post_save, sender=User)
def ensure_employee_profile(sender, instance, created, **kwargs):
    """Ensure every User always has a corresponding Employee profile."""
    from .models import Employee

    if getattr(instance, "_skip_employee_profile", False):
        return
    if skip_auto_employee.get():
        return

    if Employee.objects.filter(user_id=instance.pk).exists():
        return

    name = (
        instance.get_full_name().strip()
        or (instance.username or '').strip()
        or (instance.email.split('@')[0] if instance.email else "Employee")
    )
    try:
        Employee.objects.get_or_create(
            user=instance,
            defaults={
                'name': name,
                'department': 'Administration' if getattr(instance, 'role', '') == 'admin' else 'General',
            },
        )
    except IntegrityError:
        # Concurrent insert from serializer/create_user — profile already exists.
        return

