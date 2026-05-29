from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("attendance", "0005_alter_attendancelog_id_alter_breaklog_id"),
    ]

    operations = [
        migrations.AddField(
            model_name="attendancelog",
            name="checkout_mode",
            field=models.CharField(
                choices=[("office", "Office"), ("outside_client", "Outside Client Meeting")],
                default="office",
                max_length=30,
            ),
        ),
        migrations.AddField(
            model_name="attendancelog",
            name="checkout_note",
            field=models.TextField(blank=True, default=""),
        ),
    ]
