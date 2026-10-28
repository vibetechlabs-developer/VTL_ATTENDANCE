from django.db import connection

from .models import Employee


def upsert_employee(user, name, department, phone="", is_wfh=False, date_of_joining=None):
    """Insert or update Employee in one Postgres statement. Never raises user_id unique errors."""
    name = (name or "").strip() or (getattr(user, "username", None) or "Employee")
    department = (department or "").strip() or "General"
    phone = (phone or "").strip()
    with connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO users_employee (
                user_id, name, department, phone, is_wfh,
                address, designation, bank_account_number, bank_name, ifsc_code,
                pan_number, aadhaar_number, salary, grade, created_at, date_of_joining
            ) VALUES (
                %s, %s, %s, %s, %s,
                '', '', '', '', '',
                '', '', '', '', CURRENT_TIMESTAMP, COALESCE(%s, CURRENT_DATE)
            )
            ON CONFLICT (user_id) DO UPDATE SET
                name = EXCLUDED.name,
                department = EXCLUDED.department,
                phone = EXCLUDED.phone,
                is_wfh = EXCLUDED.is_wfh,
                date_of_joining = COALESCE(EXCLUDED.date_of_joining, users_employee.date_of_joining)
            RETURNING id
            """,
            [user.pk, name, department, phone, bool(is_wfh), date_of_joining],
        )
        row = cursor.fetchone()
    return Employee.objects.get(pk=row[0])
