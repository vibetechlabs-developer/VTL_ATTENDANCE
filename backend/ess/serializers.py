from rest_framework import serializers
from .models import ProfileChangeRequest, HRTicket, TicketComment


class ProfileChangeRequestSerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.name')
    reviewed_by_name = serializers.ReadOnlyField(source='reviewed_by.name')

    class Meta:
        model = ProfileChangeRequest
        fields = [
            'id', 'employee', 'employee_name', 'field_name',
            'old_value', 'requested_value', 'status', 'requested_on',
            'reviewed_by', 'reviewed_by_name', 'reviewed_on'
        ]
        read_only_fields = ['employee', 'old_value', 'status', 'requested_on', 'reviewed_by', 'reviewed_on']


class TicketCommentSerializer(serializers.ModelSerializer):
    author_name = serializers.ReadOnlyField(source='author.name')

    class Meta:
        model = TicketComment
        fields = ['id', 'ticket', 'author', 'author_name', 'text', 'created_on']
        read_only_fields = ['author', 'created_on']


class HRTicketSerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.name')
    assigned_to_name = serializers.ReadOnlyField(source='assigned_to.name')
    comments = TicketCommentSerializer(many=True, read_only=True)

    class Meta:
        model = HRTicket
        fields = [
            'id', 'employee', 'employee_name', 'category', 'subject',
            'description', 'priority', 'attachment', 'status', 'created_on',
            'resolved_on', 'assigned_to', 'assigned_to_name', 'comments'
        ]
        read_only_fields = ['employee', 'status', 'created_on', 'resolved_on', 'assigned_to']
