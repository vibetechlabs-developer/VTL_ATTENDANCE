from django.db import IntegrityError
from django.utils import timezone

from .models import Employee


def upsert_employee(user, name, department, phone="", is_wfh=False, date_of_joining=None):
    """Insert or update Employee for a user without unique-constraint crashes."""
    name = (name or "").strip() or (getattr(user, "username", None) or "Employee")
    department = (department or "").strip() or "General"
    phone = (phone or "").strip()
    joining = date_of_joining or timezone.localdate()

    employee = Employee.objects.filter(user=user).first()
    if employee:
        employee.name = name
        employee.department = department
        employee.phone = phone
        employee.is_wfh = bool(is_wfh)
        if date_of_joining:
            employee.date_of_joining = date_of_joining
        elif not employee.date_of_joining:
            employee.date_of_joining = joining
        employee.save()
        return employee

    try:
        return Employee.objects.create(
            user=user,
            name=name,
            department=department,
            phone=phone,
            is_wfh=bool(is_wfh),
            date_of_joining=joining,
        )
    except IntegrityError:
        employee = Employee.objects.filter(user=user).first()
        if not employee:
            raise
        employee.name = name
        employee.department = department
        employee.phone = phone
        employee.is_wfh = bool(is_wfh)
        if date_of_joining:
            employee.date_of_joining = date_of_joining
        elif not employee.date_of_joining:
            employee.date_of_joining = joining
        employee.save()
        return employee
