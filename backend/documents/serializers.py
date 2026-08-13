from rest_framework import serializers
from .models import PolicyDocument, LetterTemplate, GeneratedLetter


class PolicyDocumentSerializer(serializers.ModelSerializer):
    published_by_name = serializers.ReadOnlyField(source='published_by.name')

    class Meta:
        model = PolicyDocument
        fields = [
            'id', 'title', 'category', 'description', 'file', 'version',
            'published_by', 'published_by_name', 'published_on', 'is_active'
        ]
        read_only_fields = ['published_by', 'published_on']


class LetterTemplateSerializer(serializers.ModelSerializer):
    created_by_name = serializers.ReadOnlyField(source='created_by.name')

    class Meta:
        model = LetterTemplate
        fields = ['id', 'name', 'subject_template', 'body_template', 'created_by', 'created_by_name', 'created_at']
        read_only_fields = ['created_by', 'created_at']


class GeneratedLetterSerializer(serializers.ModelSerializer):
    template_name = serializers.ReadOnlyField(source='template.name')
    employee_name = serializers.ReadOnlyField(source='employee.name')
    generated_by_name = serializers.ReadOnlyField(source='generated_by.name')
    created_at = serializers.ReadOnlyField(source='generated_on')

    class Meta:
        model = GeneratedLetter
        fields = [
            'id', 'template', 'template_name', 'employee', 'employee_name',
            'generated_content', 'generated_by', 'generated_by_name',
            'generated_on', 'created_at', 'file'
        ]
        read_only_fields = ['generated_content', 'generated_by', 'generated_on', 'created_at', 'file']
