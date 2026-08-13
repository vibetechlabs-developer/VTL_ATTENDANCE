from django.db import models
from users.models import Employee


class AppraisalCycle(models.Model):
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('closed', 'Closed'),
    ]
    TARGET_TYPE_CHOICES = [
        ('all', 'All Employees'),
        ('department', 'Specific Department'),
        ('employees', 'Specific Employees'),
    ]

    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, default='')
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='active')
    target_type = models.CharField(max_length=20, choices=TARGET_TYPE_CHOICES, default='all')
    target_department = models.CharField(max_length=100, blank=True, default='')
    target_employees = models.ManyToManyField(
        Employee,
        blank=True,
        related_name='targeted_appraisal_cycles'
    )
    created_at = models.DateTimeField(auto_now_add=True, null=True)

    class Meta:
        db_table = 'performance_appraisalcycle'
        verbose_name = 'Appraisal Cycle'
        verbose_name_plural = 'Appraisal Cycles'
        ordering = ['-start_date']

    def __str__(self):
        return f"{self.name} ({self.status})"


class Goal(models.Model):
    cycle = models.ForeignKey(
        AppraisalCycle,
        on_delete=models.CASCADE,
        related_name='goals'
    )
    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name='performance_goals'
    )
    title = models.CharField(max_length=200)
    description = models.TextField()
    target_metric = models.TextField()
    weightage = models.IntegerField(help_text='Percentage weightage (0-100)')
    self_rating = models.IntegerField(null=True, blank=True, help_text='Rating 1-5')
    self_comment = models.TextField(blank=True)
    manager_rating = models.IntegerField(null=True, blank=True, help_text='Rating 1-5')
    manager_comment = models.TextField(blank=True)

    class Meta:
        db_table = 'performance_goal'
        verbose_name = 'Goal'
        verbose_name_plural = 'Goals'

    def __str__(self):
        return f"{self.employee.name} - {self.title} ({self.weightage}%)"


class Appraisal(models.Model):
    STATUS_CHOICES = [
        ('self_assessment_pending', 'Self Assessment Pending'),
        ('manager_review_pending', 'Manager Review Pending'),
        ('completed', 'Completed'),
    ]

    cycle = models.ForeignKey(
        AppraisalCycle,
        on_delete=models.CASCADE,
        related_name='appraisals'
    )
    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name='performance_appraisals'
    )
    overall_rating = models.FloatField(default=0.0)
    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default='self_assessment_pending'
    )

    # Multi-factor evaluation metrics (1-5 score ratings)
    punctuality_rating = models.IntegerField(null=True, blank=True, help_text='Rating 1-5 for punctuality, attendance, and late arrival record')
    punctuality_comment = models.TextField(blank=True, default='')

    quality_rating = models.IntegerField(null=True, blank=True, help_text='Rating 1-5 for work quality and accuracy')
    quality_comment = models.TextField(blank=True, default='')

    productivity_rating = models.IntegerField(null=True, blank=True, help_text='Rating 1-5 for task speed and deadline compliance')
    productivity_comment = models.TextField(blank=True, default='')

    teamwork_rating = models.IntegerField(null=True, blank=True, help_text='Rating 1-5 for communication and team collaboration')
    teamwork_comment = models.TextField(blank=True, default='')

    initiative_rating = models.IntegerField(null=True, blank=True, help_text='Rating 1-5 for problem solving and ownership')
    initiative_comment = models.TextField(blank=True, default='')

    manager_notes = models.TextField(blank=True, default='')
    employee_notes = models.TextField(blank=True, default='')

    finalized_by = models.ForeignKey(
        Employee,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='finalized_appraisals'
    )
    finalized_on = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'performance_appraisal'
        verbose_name = 'Appraisal'
        verbose_name_plural = 'Appraisals'
        unique_together = ('cycle', 'employee')

    def __str__(self):
        return f"Appraisal - {self.employee.name} ({self.cycle.name})"
