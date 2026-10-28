from django.core.management.base import BaseCommand

from leaves.services import sync_all_leave_balances


class Command(BaseCommand):
    help = "Apply joining-month leave policy and PL carry-forward to all employees."

    def handle(self, *args, **options):
        count = sync_all_leave_balances()
        self.stdout.write(self.style.SUCCESS(f"Synced leave balances for {count} employees."))
