from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0007_employee_manager"),
    ]

    operations = [
        migrations.AlterField(
            model_name="user",
            name="role",
            field=models.CharField(
                choices=[
                    ("employee", "Employee"),
                    ("manager", "Manager"),
                    ("hr", "HR"),
                    ("sales", "Sales"),
                    ("admin", "Admin"),
                ],
                default="employee",
                max_length=20,
            ),
        ),
    ]
