from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from .models import DailyUpdate
from .serializers import DailyUpdateSerializer

class DailyUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        text = request.data.get('update_text')
        if not text:
            return Response({'error': 'Update text is required.'}, status=400)

        if not hasattr(request.user, 'employee'):
            return Response({'error': 'No employee profile linked to this account.'}, status=400)

        update = DailyUpdate.objects.create(
            employee=request.user.employee,
            update_text=text
        )
        return Response({
            'message': 'Update submitted successfully.',
            'date': update.date
        })

    def get(self, request):
        date_filter = request.query_params.get('date')
        all_flag = request.query_params.get('all') == '1'
        if all_flag and request.user.role in ['admin', 'manager', 'hr']:
            updates = DailyUpdate.objects.select_related('employee__user').all().order_by('-created_at')
        else:
            updates = DailyUpdate.objects.filter(employee=request.user.employee).select_related('employee__user').order_by('-created_at')
        if date_filter:
            updates = updates.filter(date=date_filter)
        serializer = DailyUpdateSerializer(updates, many=True)
        return Response(serializer.data)