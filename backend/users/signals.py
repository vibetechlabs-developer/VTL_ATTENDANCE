from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth import get_user_model

User = get_user_model()


@receiver(post_save, sender=User)
def ensure_employee_profile(sender, instance, created, **kwargs):
    """Ensure every new User has an Employee row (idempotent upsert)."""
    if not created:
        return
    from .employee_upsert import upsert_employee

    name = (
        instance.get_full_name().strip()
        or (instance.username or "").strip()
        or (instance.email.split("@")[0] if instance.email else "Employee")
    )
    upsert_employee(
        instance,
        name=name,
        department="Administration" if getattr(instance, "role", "") == "admin" else "General",
    )
