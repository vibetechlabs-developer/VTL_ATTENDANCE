from django.db import migrations, models
from django.utils import timezone


def _current_year():
    return timezone.now().year


class Migration(migrations.Migration):

    dependencies = [
        ("leaves", "0008_leave_policy_year_and_carry"),
    ]

    operations = [
        migrations.AlterField(
            model_name="leaverequest",
            name="leave_type",
            field=models.CharField(
                choices=[
                    ("casual", "Casual"),
                    ("sick", "Sick"),
                    ("earned", "Paid"),
                    ("exam", "Exam"),
                    ("college", "College"),
                    ("other", "Other"),
                ],
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="leavebalance",
            name="year",
            field=models.PositiveIntegerField(default=_current_year),
        ),
    ]
