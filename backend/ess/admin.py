from django.contrib import admin
from .models import ProfileChangeRequest, HRTicket, TicketComment


@admin.register(ProfileChangeRequest)
class ProfileChangeRequestAdmin(admin.ModelAdmin):
    list_display = ('id', 'employee', 'field_name', 'old_value', 'requested_value', 'status', 'requested_on', 'reviewed_by')
    list_filter = ('status', 'field_name')
    search_fields = ('employee__name', 'field_name')


class TicketCommentInline(admin.TabularInline):
    model = TicketComment
    extra = 1


@admin.register(HRTicket)
class HRTicketAdmin(admin.ModelAdmin):
    list_display = ('id', 'employee', 'category', 'subject', 'status', 'assigned_to', 'created_on')
    list_filter = ('status', 'category')
    search_fields = ('employee__name', 'subject', 'description')
    inlines = [TicketCommentInline]


@admin.register(TicketComment)
class TicketCommentAdmin(admin.ModelAdmin):
    list_display = ('id', 'ticket', 'author', 'created_on')
    search_fields = ('author__name', 'text')
