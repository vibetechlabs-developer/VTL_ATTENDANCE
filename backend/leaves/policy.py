from calendar import month_name
from decimal import Decimal

from django.utils import timezone

ANNUAL_CL = Decimal("10")
ANNUAL_SL = Decimal("10")
ANNUAL_PL = Decimal("15")

# First-year entitlement by joining month (calendar year).
JOINING_MONTH_ENTITLEMENT = {
    1: (Decimal("10"), Decimal("10"), Decimal("15")),
    2: (Decimal("9"), Decimal("9"), Decimal("14")),
    3: (Decimal("8"), Decimal("8"), Decimal("13")),
    4: (Decimal("7"), Decimal("7"), Decimal("11")),
    5: (Decimal("6"), Decimal("6"), Decimal("10")),
    6: (Decimal("5"), Decimal("5"), Decimal("9")),
    7: (Decimal("4"), Decimal("4"), Decimal("8")),
    8: (Decimal("3"), Decimal("3"), Decimal("6")),
    9: (Decimal("2"), Decimal("2"), Decimal("5")),
    10: (Decimal("1"), Decimal("1"), Decimal("3")),
    11: (Decimal("1"), Decimal("1"), Decimal("1")),
    12: (Decimal("0"), Decimal("0"), Decimal("0")),
}


def get_joining_date(employee):
    if getattr(employee, "date_of_joining", None):
        return employee.date_of_joining
    created_at = getattr(employee, "created_at", None)
    if created_at:
        return created_at.date() if hasattr(created_at, "date") else created_at
    user = getattr(employee, "user", None)
    if user and getattr(user, "date_joined", None):
        return user.date_joined.date()
    return timezone.now().date()


def entitlement_for_year(employee, year=None):
    """Return (CL, SL, PL) for the given calendar year, excluding PL carry-forward."""
    year = year or timezone.now().year
    joining = get_joining_date(employee)
    if joining.year > year:
        return Decimal("0"), Decimal("0"), Decimal("0")
    if joining.year == year:
        return JOINING_MONTH_ENTITLEMENT[joining.month]
    return ANNUAL_CL, ANNUAL_SL, ANNUAL_PL


def policy_snapshot(employee, year=None, pl_carried_forward=None):
    year = year or timezone.now().year
    joining = get_joining_date(employee)
    cl, sl, pl = entitlement_for_year(employee, year)
    carried = Decimal(str(pl_carried_forward or 0))
    is_joining_year = joining.year == year
    return {
        "year": year,
        "joining_date": joining.isoformat(),
        "joining_month": joining.month,
        "joining_month_name": month_name[joining.month],
        "is_joining_year": is_joining_year,
        "casual_total": cl,
        "sick_total": sl,
        "pl_base": pl,
        "pl_carried_forward": carried,
        "earned_total": pl + carried,
        "annual_full": {
            "casual": ANNUAL_CL,
            "sick": ANNUAL_SL,
            "paid": ANNUAL_PL,
        },
    }
