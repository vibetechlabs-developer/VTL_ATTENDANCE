from decimal import Decimal
from django.core.management.base import BaseCommand
from django.utils import timezone
from leave.models import LeaveType, LeaveBalance
from users.models import Employee


class Command(BaseCommand):
    help = 'Monthly cron command to accrue employee leave balances'

    def handle(self, *args, **options):
        now = timezone.now()
        current_year = now.year
        employees = Employee.objects.filter(user__is_active=True)
        monthly_leave_types = LeaveType.objects.filter(accrual_frequency='monthly')

        self.stdout.write(f"Running leave accrual for {employees.count()} employees, year {current_year}...")

        updated_count = 0
        for emp in employees:
            for lt in monthly_leave_types:
                monthly_amount = Decimal(str(lt.annual_quota)) / Decimal('12')

                balance, created = LeaveBalance.objects.get_or_create(
                    employee=emp,
                    leave_type=lt,
                    year=current_year,
                    defaults={'allocated': Decimal('0'), 'used': Decimal('0')}
                )

                new_allocated = balance.allocated + monthly_amount
                annual_quota_dec = Decimal(str(lt.annual_quota))

                # Cap at annual_quota
                if new_allocated > annual_quota_dec:
                    new_allocated = annual_quota_dec

                balance.allocated = new_allocated
                balance.save()
                updated_count += 1

        self.stdout.write(self.style.SUCCESS(f"Accrual complete. Updated {updated_count} leave balances."))
