from django.conf import settings
from django.db import migrations, models


def copy_manager_to_managers(apps, schema_editor):
    Employee = apps.get_model('users', 'Employee')
    for employee in Employee.objects.exclude(manager_id=None).iterator():
        employee.managers.add(employee.manager_id)


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0008_alter_user_role_sales'),
    ]

    operations = [
        migrations.AddField(
            model_name='employee',
            name='managers',
            field=models.ManyToManyField(
                blank=True,
                related_name='managed_team_members',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.RunPython(copy_manager_to_managers, migrations.RunPython.noop),
    ]
