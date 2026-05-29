from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("attendance", "0006_attendancelog_checkout_context"),
    ]

    operations = [
        migrations.CreateModel(
            name="CallLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("call_start", models.DateTimeField()),
                ("call_end", models.DateTimeField(blank=True, null=True)),
                (
                    "attendance",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="call_logs",
                        to="attendance.attendancelog",
                    ),
                ),
            ],
        ),
    ]
