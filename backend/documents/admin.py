from django.contrib import admin
from .models import PolicyDocument, LetterTemplate, GeneratedLetter


@admin.register(PolicyDocument)
class PolicyDocumentAdmin(admin.ModelAdmin):
    list_display = ('id', 'title', 'category', 'version', 'is_active', 'published_by', 'published_on')
    list_filter = ('category', 'is_active')
    search_fields = ('title', 'version')


@admin.register(LetterTemplate)
class LetterTemplateAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'created_by')
    search_fields = ('name', 'body_template')


@admin.register(GeneratedLetter)
class GeneratedLetterAdmin(admin.ModelAdmin):
    list_display = ('id', 'template', 'employee', 'generated_by', 'generated_on')
    search_fields = ('employee__name', 'template__name')
