from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('leaves', '0003_alter_leavebalance_id_alter_leaverequest_id'),
    ]

    operations = [
        migrations.AddField(
            model_name='leaverequest',
            name='is_half_day',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='leavebalance',
            name='casual_total',
            field=models.DecimalField(decimal_places=1, default=12, max_digits=5),
        ),
        migrations.AlterField(
            model_name='leavebalance',
            name='casual_used',
            field=models.DecimalField(decimal_places=1, default=0, max_digits=5),
        ),
        migrations.AlterField(
            model_name='leavebalance',
            name='earned_total',
            field=models.DecimalField(decimal_places=1, default=15, max_digits=5),
        ),
        migrations.AlterField(
            model_name='leavebalance',
            name='earned_used',
            field=models.DecimalField(decimal_places=1, default=0, max_digits=5),
        ),
        migrations.AlterField(
            model_name='leavebalance',
            name='sick_total',
            field=models.DecimalField(decimal_places=1, default=10, max_digits=5),
        ),
        migrations.AlterField(
            model_name='leavebalance',
            name='sick_used',
            field=models.DecimalField(decimal_places=1, default=0, max_digits=5),
        ),
    ]
