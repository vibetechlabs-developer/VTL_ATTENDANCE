from django.core.management.base import BaseCommand

from attendance.models import AttendanceLog
from attendance.views import _close_open_attendance_session


class Command(BaseCommand):
    help = "Auto-checkout open attendance sessions (schedule nightly via cron)."

    def handle(self, *args, **options):
        stale_logs = AttendanceLog.objects.filter(check_out__isnull=True).select_related("employee")
        closed = 0
        for log in stale_logs:
            lat = log.check_in_lat if log.check_in_lat is not None else 0
            lng = log.check_in_lng if log.check_in_lng is not None else 0
            _close_open_attendance_session(log, lat, lng)
            note = (log.checkout_note or "").strip()
            cleanup = "Auto-checkout by system cleanup."
            log.checkout_note = f"{note} {cleanup}".strip() if note else cleanup
            log.save(update_fields=["checkout_note"])
            closed += 1
        self.stdout.write(self.style.SUCCESS(f"Closed {closed} stale session(s)."))
