from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("attendance", "0008_alter_attendancelog_id_alter_breaklog_id"),
    ]

    operations = [
        migrations.AlterField(
            model_name="attendancelog",
            name="date",
            field=models.DateField(auto_now_add=True, db_index=True),
        ),
    ]
