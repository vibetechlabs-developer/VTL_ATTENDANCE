from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth import get_user_model

User = get_user_model()


@receiver(post_save, sender=User)
def ensure_employee_profile(sender, instance, created, **kwargs):
    """Ensure every User always has a corresponding Employee profile."""
    from .models import Employee

    try:
        employee = instance.employee
    except Employee.DoesNotExist:
        name = (
            instance.get_full_name().strip()
            or (instance.username or '').strip()
            or (instance.email.split('@')[0] if instance.email else "Employee")
        )
        Employee.objects.get_or_create(
            user=instance,
            defaults={
                'name': name,
                'department': 'Administration' if getattr(instance, 'role', '') == 'admin' else 'General',
            }
        )

