from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from leaves.models import LeaveBalance
from leaves.policy import JOINING_MONTH_ENTITLEMENT, entitlement_for_year
from leaves.services import ensure_leave_balance
from users.models import Employee

User = get_user_model()


class LeavePolicyTests(TestCase):
    def _employee(self, email, joining):
        user = User.objects.create_user(
            email=email,
            username=email.split("@")[0],
            password="pass12345",
            role="employee",
        )
        emp = user.employee
        emp.date_of_joining = joining
        emp.name = email
        emp.save(update_fields=["date_of_joining", "name"])
        return emp

    def test_joining_month_table(self):
        year = timezone.now().year
        emp = self._employee("june@vtl.local", date(year, 6, 15))
        self.assertEqual(entitlement_for_year(emp, year), JOINING_MONTH_ENTITLEMENT[6])
        bal = ensure_leave_balance(emp)
        self.assertEqual(bal.casual_total, Decimal("5"))
        self.assertEqual(bal.sick_total, Decimal("5"))
        self.assertEqual(bal.earned_total, Decimal("9"))
        self.assertEqual(bal.pl_carried_forward, Decimal("0"))

    def test_january_gets_full_quota(self):
        year = timezone.now().year
        emp = self._employee("jan@vtl.local", date(year, 1, 2))
        bal = ensure_leave_balance(emp)
        self.assertEqual((bal.casual_total, bal.sick_total, bal.earned_total), (Decimal("10"), Decimal("10"), Decimal("15")))

    def test_december_join_gets_zero(self):
        year = timezone.now().year
        emp = self._employee("dec@vtl.local", date(year, 12, 1))
        bal = ensure_leave_balance(emp)
        self.assertEqual((bal.casual_total, bal.sick_total, bal.earned_total), (Decimal("0"), Decimal("0"), Decimal("0")))

    def test_previous_year_join_gets_full_quota(self):
        year = timezone.now().year
        emp = self._employee("old@vtl.local", date(year - 1, 8, 10))
        bal = ensure_leave_balance(emp)
        self.assertEqual((bal.casual_total, bal.sick_total, bal.earned_total), (Decimal("10"), Decimal("10"), Decimal("15")))

    def test_pl_carry_forward_on_year_rollover(self):
        year = timezone.now().year
        emp = self._employee("carry@vtl.local", date(year - 1, 1, 10))
        bal = ensure_leave_balance(emp)
        bal.year = year - 1
        bal.earned_total = Decimal("15")
        bal.earned_used = Decimal("4")
        bal.casual_used = Decimal("3")
        bal.save()
        bal = ensure_leave_balance(emp)
        self.assertEqual(bal.year, year)
        self.assertEqual(bal.pl_carried_forward, Decimal("11"))
        self.assertEqual(bal.earned_total, Decimal("26"))
        self.assertEqual(bal.earned_used, Decimal("0"))
        self.assertEqual(bal.casual_used, Decimal("0"))
        self.assertEqual(bal.casual_total, Decimal("10"))
