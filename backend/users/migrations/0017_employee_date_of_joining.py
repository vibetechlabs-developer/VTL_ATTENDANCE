from django.db import migrations, models


def backfill_joining_dates(apps, schema_editor):
    Employee = apps.get_model("users", "Employee")
    for emp in Employee.objects.all():
        if emp.date_of_joining:
            continue
        if emp.created_at:
            emp.date_of_joining = emp.created_at.date()
            emp.save(update_fields=["date_of_joining"])


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0016_employee_aadhaar_number_employee_address_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="employee",
            name="date_of_joining",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.RunPython(backfill_joining_dates, migrations.RunPython.noop),
    ]
