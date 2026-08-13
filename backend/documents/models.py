from django.db import models
from users.models import Employee


class PolicyDocument(models.Model):
    title = models.CharField(max_length=200)
    category = models.CharField(max_length=100, blank=True, default='General', help_text='e.g. HR Policy, IT Policy, Code of Conduct, Benefits, Compliance')
    description = models.TextField(blank=True, default='')
    file = models.FileField(upload_to='policy_documents/')
    version = models.CharField(max_length=20, default='1.0')
    published_by = models.ForeignKey(
        Employee,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='published_policies'
    )
    published_on = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'documents_policydocument'
        verbose_name = 'Policy Document'
        verbose_name_plural = 'Policy Documents'
        ordering = ['-published_on']

    def __str__(self):
        return f"{self.title} (v{self.version}) - {'Active' if self.is_active else 'Inactive'}"


class LetterTemplate(models.Model):
    name = models.CharField(max_length=150)
    subject_template = models.CharField(
        max_length=300,
        blank=True,
        default='',
        help_text='Email/letter subject line with {{employee.field}} placeholders'
    )
    body_template = models.TextField(help_text='HTML or plain text template using {{employee.field_name}} placeholders')
    created_by = models.ForeignKey(
        Employee,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='created_letter_templates'
    )
    created_at = models.DateTimeField(auto_now_add=True, null=True)

    class Meta:
        db_table = 'documents_lettertemplate'
        verbose_name = 'Letter Template'
        verbose_name_plural = 'Letter Templates'
        ordering = ['-created_at']

    def __str__(self):
        return self.name


class GeneratedLetter(models.Model):
    template = models.ForeignKey(
        LetterTemplate,
        on_delete=models.CASCADE,
        related_name='generated_letters'
    )
    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name='generated_letters'
    )
    generated_content = models.TextField()
    generated_by = models.ForeignKey(
        Employee,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='letters_generated_by_user'
    )
    generated_on = models.DateTimeField(auto_now_add=True)
    file = models.FileField(upload_to='generated_letters/', null=True, blank=True)

    class Meta:
        db_table = 'documents_generatedletter'
        verbose_name = 'Generated Letter'
        verbose_name_plural = 'Generated Letters'
        ordering = ['-generated_on']

    def __str__(self):
        return f"{self.template.name} for {self.employee.name} on {self.generated_on}"
