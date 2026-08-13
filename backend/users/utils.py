"""Employee display helpers."""


def format_employee_id(employee):
    """Return VTL-{id:03d} display label; Employee.id remains the canonical DB key."""
    if not employee:
        return 'VTL-000'
    return f'VTL-{str(employee.pk).zfill(3)}'


def get_or_create_employee(user):
    """Safely get or create an Employee profile for the given user."""
    if not user or not user.is_authenticated:
        return None

    try:
        return user.employee
    except Exception:
        from .models import Employee
        name = (
            user.get_full_name()
            or getattr(user, 'name', None)
            or getattr(user, 'username', None)
            or (user.email.split('@')[0] if getattr(user, 'email', None) else "Employee")
        )
        employee, _ = Employee.objects.get_or_create(
            user=user,
            defaults={
                'name': name,
                'department': 'General',
            }
        )
        return employee

