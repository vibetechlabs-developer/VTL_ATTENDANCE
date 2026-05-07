from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0006_merge_0005s"),
    ]

    operations = [
        migrations.AddField(
            model_name="employee",
            name="manager",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="managed_employees",
                to="users.user",
            ),
        ),
    ]

