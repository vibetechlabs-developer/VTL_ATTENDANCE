from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from .models import LeaveBalance
from .policy import entitlement_for_year


def _d(value):
    if value is None:
        return Decimal("0")
    return Decimal(str(value))


@transaction.atomic
def ensure_leave_balance(employee):
    """Allocate / refresh current-year leave using joining-month policy.

    Unused paid leave (PL) from a previous year is carried into earned_total.
    Casual and sick leaves reset each calendar year (no carry-forward).
    Used days for the current year are preserved.
    """
    year = timezone.now().year
    balance, created = LeaveBalance.objects.select_for_update().get_or_create(
        employee=employee,
        defaults={
            "year": year,
            "casual_total": Decimal("0"),
            "casual_used": Decimal("0"),
            "sick_total": Decimal("0"),
            "sick_used": Decimal("0"),
            "earned_total": Decimal("0"),
            "earned_used": Decimal("0"),
            "pl_carried_forward": Decimal("0"),
        },
    )

    stored_year = int(balance.year or year)

    if stored_year < year:
        unused_pl = max(Decimal("0"), _d(balance.earned_total) - _d(balance.earned_used))
        cl, sl, pl = entitlement_for_year(employee, year)
        balance.year = year
        balance.casual_total = cl
        balance.casual_used = Decimal("0")
        balance.sick_total = sl
        balance.sick_used = Decimal("0")
        balance.pl_carried_forward = unused_pl
        balance.earned_total = pl + unused_pl
        balance.earned_used = Decimal("0")
        balance.save()
        return balance

    cl, sl, pl = entitlement_for_year(employee, year)
    if created or not stored_year:
        balance.pl_carried_forward = Decimal("0")
    carried = _d(balance.pl_carried_forward)
    balance.year = year
    balance.casual_total = cl
    balance.sick_total = sl
    balance.earned_total = pl + carried
    balance.save()
    return balance


def sync_all_leave_balances():
    from users.models import Employee

    count = 0
    for emp in Employee.objects.select_related("user").all():
        ensure_leave_balance(emp)
        count += 1
    return count
