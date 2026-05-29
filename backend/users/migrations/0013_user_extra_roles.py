from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0012_alter_employee_id_alter_officelocation_id_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="extra_roles",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
