from django.urls import path
from .views import DailyUpdateView

urlpatterns = [
    path('', DailyUpdateView.as_view(), name='daily-update'),
]