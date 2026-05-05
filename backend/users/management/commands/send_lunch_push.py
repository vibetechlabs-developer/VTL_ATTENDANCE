from django.core.management.base import BaseCommand

from users.models import PushSubscription
from users.push_utils import send_push_message


class Command(BaseCommand):
    help = "Send lunch reminder push notifications to subscribed users."

    def add_arguments(self, parser):
        parser.add_argument(
            "--phase",
            choices=["start", "end"],
            default="start",
            help="start => 1:00 PM reminder, end => 1:30 PM follow-up",
        )

    def handle(self, *args, **options):
        phase = options["phase"]
        if phase == "end":
            title = "Break Duration Alert"
            body = "You have completed a 30-minute break."
            ntype = "warning"
        else:
            title = "Lunch Break Reminder"
            body = "It's 1:00 PM. Please take your lunch break."
            ntype = "info"

        payload = (
            '{"title":"%s","body":"%s","type":"%s","icon":"/vtl-logo.svg","url":"/employee"}'
            % (title.replace('"', '\\"'), body.replace('"', '\\"'), ntype)
        )
        sent = send_push_message(PushSubscription.objects.all(), payload)
        self.stdout.write(self.style.SUCCESS(f"Push sent to {sent} subscriptions (phase={phase})."))
