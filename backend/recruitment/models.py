from django.db import models
from users.models import Employee


class JobOpening(models.Model):
    STATUS_CHOICES = [
        ('open', 'Open'),
        ('paused', 'Paused'),
        ('closed', 'Closed'),
    ]

    title = models.CharField(max_length=200)
    department = models.CharField(max_length=100)
    location = models.CharField(max_length=100)
    experience_required = models.TextField()
    description = models.TextField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='open')
    posted_by = models.ForeignKey(
        Employee,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='posted_job_openings'
    )
    posted_on = models.DateTimeField(auto_now_add=True)
    closing_date = models.DateField(null=True, blank=True)

    class Meta:
        db_table = 'recruitment_jobopening'
        verbose_name = 'Job Opening'
        verbose_name_plural = 'Job Openings'
        ordering = ['-posted_on']

    def __str__(self):
        return f"{self.title} ({self.department}) - {self.status}"


class Candidate(models.Model):
    name = models.CharField(max_length=100)
    email = models.EmailField()
    phone = models.CharField(max_length=20)
    resume = models.FileField(upload_to='resumes/')
    source = models.CharField(max_length=100, default='Direct')
    created_on = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'recruitment_candidate'
        verbose_name = 'Candidate'
        verbose_name_plural = 'Candidates'
        ordering = ['-created_on']

    def __str__(self):
        return f"{self.name} ({self.email})"


class Application(models.Model):
    STAGE_CHOICES = [
        ('applied', 'Applied'),
        ('shortlisted', 'Shortlisted'),
        ('interview', 'Interview'),
        ('offered', 'Offered'),
        ('rejected', 'Rejected'),
        ('hired', 'Hired'),
    ]

    job_opening = models.ForeignKey(
        JobOpening,
        on_delete=models.CASCADE,
        related_name='applications'
    )
    candidate = models.ForeignKey(
        Candidate,
        on_delete=models.CASCADE,
        related_name='applications'
    )
    stage = models.CharField(max_length=20, choices=STAGE_CHOICES, default='applied')
    applied_on = models.DateTimeField(auto_now_add=True)
    updated_on = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'recruitment_application'
        verbose_name = 'Application'
        verbose_name_plural = 'Applications'
        unique_together = ('job_opening', 'candidate')
        ordering = ['-applied_on']

    def __str__(self):
        return f"{self.candidate.name} - {self.job_opening.title} ({self.stage})"


class Interview(models.Model):
    MODE_CHOICES = [
        ('in_person', 'In Person'),
        ('video', 'Video'),
    ]
    STATUS_CHOICES = [
        ('scheduled', 'Scheduled'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]

    application = models.ForeignKey(
        Application,
        on_delete=models.CASCADE,
        related_name='interviews'
    )
    scheduled_on = models.DateTimeField()
    mode = models.CharField(max_length=20, choices=MODE_CHOICES, default='video')
    panel_members = models.ManyToManyField(
        Employee,
        related_name='interviews_as_panel'
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='scheduled')
    feedback = models.TextField(blank=True)
    rating = models.IntegerField(null=True, blank=True, help_text='Rating 1-5')

    class Meta:
        db_table = 'recruitment_interview'
        verbose_name = 'Interview'
        verbose_name_plural = 'Interviews'
        ordering = ['-scheduled_on']

    def __str__(self):
        return f"Interview for {self.application.candidate.name} on {self.scheduled_on}"
