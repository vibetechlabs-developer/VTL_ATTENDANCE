"""Signal-based audit logger (SYS-03)."""

import threading

from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from core.models import AuditLog

_thread_local = threading.local()

EXCLUDED_MODELS = {
    ('core', 'auditlog'),
    ('migrations', 'migration'),
    ('sessions', 'session'),
    ('token_blacklist', 'outstandingtoken'),
    ('token_blacklist', 'blacklistedtoken'),
    ('contenttypes', 'contenttype'),
    ('admin', 'logentry'),
}


def _audit_table_ready():
    from django.db import connection
    try:
        return AuditLog._meta.db_table in connection.introspection.table_names()
    except Exception:
        return False


def set_audit_user(user):
    """Set the acting user for the current thread (called from DRF middleware/view)."""
    _thread_local.audit_user = user


def get_audit_user():
    return getattr(_thread_local, 'audit_user', None)


def clear_audit_user():
    if hasattr(_thread_local, 'audit_user'):
        del _thread_local.audit_user


def _model_key(model):
    return model._meta.app_label.lower(), model._meta.model_name.lower()


def _should_audit(model):
    return _model_key(model) not in EXCLUDED_MODELS


def _serialize_value(value):
    if value is None:
        return None
    if hasattr(value, 'isoformat'):
        return value.isoformat()
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _field_changes(instance, old_values):
    changes = {}
    for field in instance._meta.fields:
        name = field.name
        if name in ('created_at', 'updated_at'):
            continue
        new_val = _serialize_value(getattr(instance, name, None))
        old_val = old_values.get(name)
        if old_val != new_val:
            changes[name] = {'old': old_val, 'new': new_val}
    return changes


@receiver(pre_save)
def capture_pre_save_state(sender, instance, **kwargs):
    if not _should_audit(sender):
        return
    if instance.pk is None:
        instance._audit_old_values = {}
        return
    try:
        old = sender.objects.get(pk=instance.pk)
    except sender.DoesNotExist:
        instance._audit_old_values = {}
        return
    instance._audit_old_values = {
        f.name: _serialize_value(getattr(old, f.name, None))
        for f in sender._meta.fields
    }


@receiver(post_save)
def log_model_save(sender, instance, created, **kwargs):
    if not _should_audit(sender) or not _audit_table_ready():
        return
    user = get_audit_user()
    app_label, model_name = _model_key(sender)
    if created:
        AuditLog.objects.create(
            user=user,
            action=AuditLog.ACTION_CREATE,
            app_label=app_label,
            model_name=model_name,
            object_id=str(instance.pk),
            object_repr=str(instance)[:255],
            changes={},
        )
        return
    old_values = getattr(instance, '_audit_old_values', {})
    changes = _field_changes(instance, old_values)
    if not changes:
        return
    AuditLog.objects.create(
        user=user,
        action=AuditLog.ACTION_UPDATE,
        app_label=app_label,
        model_name=model_name,
        object_id=str(instance.pk),
        object_repr=str(instance)[:255],
        changes=changes,
    )


@receiver(post_delete)
def log_model_delete(sender, instance, **kwargs):
    if not _should_audit(sender) or not _audit_table_ready():
        return
    user = get_audit_user()
    app_label, model_name = _model_key(sender)
    AuditLog.objects.create(
        user=user,
        action=AuditLog.ACTION_DELETE,
        app_label=app_label,
        model_name=model_name,
        object_id=str(instance.pk),
        object_repr=str(instance)[:255],
        changes={},
    )
