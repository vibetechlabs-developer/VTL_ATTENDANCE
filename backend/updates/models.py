from django.db import models
from users.models import Employee  # ← users thi import

class DailyUpdate(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE)
    date = models.DateField(auto_now_add=True)
    update_text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Update - {self.employee.name} - {self.date}"