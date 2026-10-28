from django.db import migrations, models
from django.utils import timezone


def apply_joining_policy(apps, schema_editor):
    from leaves.policy import entitlement_for_year

    LeaveBalance = apps.get_model("leaves", "LeaveBalance")
    year = timezone.now().year
    for bal in LeaveBalance.objects.select_related("employee", "employee__user"):
        cl, sl, pl = entitlement_for_year(bal.employee, year)
        bal.year = year
        bal.pl_carried_forward = 0
        bal.casual_total = cl
        bal.sick_total = sl
        bal.earned_total = pl
        bal.save()


class Migration(migrations.Migration):

    dependencies = [
        ("leaves", "0007_alter_leaverequest_end_date_and_more"),
        ("users", "0017_employee_date_of_joining"),
    ]

    operations = [
        migrations.AddField(
            model_name="leavebalance",
            name="year",
            field=models.PositiveIntegerField(default=timezone.now().year),
        ),
        migrations.AddField(
            model_name="leavebalance",
            name="pl_carried_forward",
            field=models.DecimalField(decimal_places=1, default=0, max_digits=5),
        ),
        migrations.AlterField(
            model_name="leavebalance",
            name="casual_total",
            field=models.DecimalField(decimal_places=1, default=10, max_digits=5),
        ),
        migrations.RunPython(apply_joining_policy, migrations.RunPython.noop),
    ]
