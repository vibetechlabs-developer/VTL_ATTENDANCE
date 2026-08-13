from django.db import models
from users.models import Employee


class TrainingProgram(models.Model):
    MODE_CHOICES = [
        ('online', 'Online'),
        ('offline', 'Offline'),
    ]

    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    trainer_name = models.CharField(max_length=150)
    mode = models.CharField(max_length=20, choices=MODE_CHOICES, default='online')
    scheduled_date = models.DateField()
    duration_hours = models.FloatField()
    target_department = models.CharField(
        max_length=100,
        blank=True,
        help_text='Blank = all departments'
    )
    created_by = models.ForeignKey(
        Employee,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='created_training_programs'
    )
    max_participants = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        db_table = 'training_trainingprogram'
        verbose_name = 'Training Program'
        verbose_name_plural = 'Training Programs'
        ordering = ['-scheduled_date']

    def __str__(self):
        return f"{self.title} ({self.scheduled_date})"


class TrainingEnrollment(models.Model):
    program = models.ForeignKey(
        TrainingProgram,
        on_delete=models.CASCADE,
        related_name='enrollments'
    )
    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name='training_enrollments'
    )
    attended = models.BooleanField(default=False)
    feedback_rating = models.IntegerField(null=True, blank=True, help_text='Rating 1-5')
    feedback_comment = models.TextField(blank=True)
    enrolled_on = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'training_trainingenrollment'
        verbose_name = 'Training Enrollment'
        verbose_name_plural = 'Training Enrollments'
        unique_together = ('program', 'employee')

    def __str__(self):
        return f"{self.employee.name} enrolled in {self.program.title}"
