from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from .models import DailyUpdate
from .serializers import DailyUpdateSerializer

SALES_REQUIRED_REPORT_FIELDS = [
    "total_calls",
    "calls_received",
    "meetings",
    "clients_done",
    "data_extracted_india",
    "data_extracted_abroad",
    "mail_sent_b2b",
    "mail_sent_general",
    "linkedin_post",
    "linkedin_connections",
    "linkedin_messages",
    "linkedin_data_extracted",
    "newspaper_read",
    "newspaper_important_news",
    "group_photos_added",
]

SALES_MINIMUMS = {
    "total_calls": 100,
    "calls_received": 80,
    "data_extracted_india": 500,
    "data_extracted_abroad": 500,
    "mail_sent_b2b": 10,
    "mail_sent_general": 10,
    "linkedin_connections": 0,
    "linkedin_messages": 100,
    "linkedin_data_extracted": 25,
}

SALES_BLOG_PPT_MIN = 1
SALES_BUSINESS_CLASSIFIED_MIN = 5


def _int_or_none(value):
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _normalize_url(url):
    if not isinstance(url, str):
        return ""
    u = url.strip()
    if not u:
        return ""
    # Normalize a bit so the same link is detected (case + trailing slash).
    u = u.lower()
    while u.endswith("/") and len(u) > 8:
        u = u[:-1]
    return u


def _split_links(value):
    if not isinstance(value, str):
        return []
    parts = []
    for p in value.replace(",", "\n").splitlines():
        n = _normalize_url(p)
        if n:
            parts.append(n)
    return parts


class DailyUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        text = request.data.get('update_text')
        if not text:
            return Response({'error': 'Update text is required.'}, status=400)

        if not hasattr(request.user, 'employee'):
            return Response({'error': 'No employee profile linked to this account.'}, status=400)

        report_data = request.data.get('report_data')
        if report_data is not None and not isinstance(report_data, dict):
            return Response({'error': 'report_data must be an object.'}, status=400)

        if request.user.role == 'sales':
            if not isinstance(report_data, dict):
                return Response({'error': 'Sales daily report is compulsory before check-out.'}, status=400)

            # 1) Required fields (except Blog/PPT and Business/Classified OR-groups)
            required_single_fields = [
                f
                for f in SALES_REQUIRED_REPORT_FIELDS
                if f
                not in [
                    "blog_posts",
                    "ppt_posts",
                    "business_listings",
                    "classified_ads",
                    "newspaper_important_news",  # required only when newspaper_read is true
                ]
            ]
            missing_fields = [field for field in required_single_fields if report_data.get(field) in [None, ""]]
            # Booleans: group_photos_added must be explicitly confirmed (True).
            if report_data.get("group_photos_added") is not True and "group_photos_added" not in missing_fields:
                missing_fields.append("group_photos_added")
            if missing_fields:
                return Response({
                    'error': 'Sales daily report is incomplete. Fill all compulsory fields before check-out.',
                    'missing_fields': missing_fields,
                }, status=400)

            # 2) OR-group: (Blog OR PPT) => minimum 1 in either
            blog_num = _int_or_none(report_data.get("blog_posts"))
            ppt_num = _int_or_none(report_data.get("ppt_posts"))
            blog_ok = blog_num is not None and blog_num >= SALES_BLOG_PPT_MIN
            ppt_ok = ppt_num is not None and ppt_num >= SALES_BLOG_PPT_MIN

            invalid_fields = []
            if not (blog_ok or ppt_ok):
                invalid_fields.extend([
                    {"field": "blog_posts", "minimum": SALES_BLOG_PPT_MIN, "actual": report_data.get("blog_posts")},
                    {"field": "ppt_posts", "minimum": SALES_BLOG_PPT_MIN, "actual": report_data.get("ppt_posts")},
                ])

            # 3) OR-group: (Business listings OR Classified ads) => minimum 5 in either
            business_num = _int_or_none(report_data.get("business_listings"))
            classified_num = _int_or_none(report_data.get("classified_ads"))
            business_ok = business_num is not None and business_num >= SALES_BUSINESS_CLASSIFIED_MIN
            classified_ok = classified_num is not None and classified_num >= SALES_BUSINESS_CLASSIFIED_MIN

            if not (business_ok or classified_ok):
                invalid_fields.extend([
                    {"field": "business_listings", "minimum": SALES_BUSINESS_CLASSIFIED_MIN, "actual": report_data.get("business_listings")},
                    {"field": "classified_ads", "minimum": SALES_BUSINESS_CLASSIFIED_MIN, "actual": report_data.get("classified_ads")},
                ])

            # 3b) If counts are ok, require corresponding links
            blog_links = (report_data.get("blog_links") or "").strip()
            ppt_links = (report_data.get("ppt_links") or "").strip()
            business_links = (report_data.get("business_links") or "").strip()
            classified_links = (report_data.get("classified_links") or "").strip()

            if blog_ok and not blog_links:
                invalid_fields.append({"field": "blog_links", "minimum": 1, "actual": 0})
            if ppt_ok and not ppt_links:
                invalid_fields.append({"field": "ppt_links", "minimum": 1, "actual": 0})
            if business_ok and not business_links:
                invalid_fields.append({"field": "business_links", "minimum": 5, "actual": 0})
            if classified_ok and not classified_links:
                invalid_fields.append({"field": "classified_links", "minimum": 5, "actual": 0})

            # If 5 target reached, ensure at least 5 links are provided.
            if business_ok and business_links:
                business_link_count = len([l for l in business_links.replace(",", "\n").splitlines() if l.strip()])
                if business_link_count < 5:
                    invalid_fields.append({"field": "business_links", "minimum": 5, "actual": business_link_count})
            if classified_ok and classified_links:
                classified_link_count = len([l for l in classified_links.replace(",", "\n").splitlines() if l.strip()])
                if classified_link_count < 5:
                    invalid_fields.append({"field": "classified_links", "minimum": 5, "actual": classified_link_count})

            # Newspaper important news only required when newspaper_read is true.
            newspaper_read = report_data.get("newspaper_read")
            if newspaper_read is True and not (report_data.get("newspaper_important_news") or "").strip():
                invalid_fields.append({"field": "newspaper_important_news", "minimum": 1, "actual": 0})

            # 3c) Links must be new (not submitted earlier by same employee)
            current_links_by_field = {
                "blog_links": _split_links(blog_links),
                "ppt_links": _split_links(ppt_links),
                "business_links": _split_links(business_links),
                "classified_links": _split_links(classified_links),
            }

            previous_updates = (
                DailyUpdate.objects
                .filter(employee=request.user.employee)
                .exclude(report_data__isnull=True)
                .order_by("-created_at")[:200]
            )

            previously_used_links = set()
            for prev in previous_updates:
                prev_data = prev.report_data if isinstance(prev.report_data, dict) else {}
                for k in ["blog_links", "ppt_links", "business_links", "classified_links"]:
                    previously_used_links.update(_split_links(prev_data.get(k) or ""))

            duplicate_links = []
            for field, links in current_links_by_field.items():
                for link in links:
                    if link in previously_used_links:
                        duplicate_links.append({"field": field, "url": link})

            if duplicate_links:
                return Response({
                    "error": "Some links were already submitted before. Please add new links.",
                    "duplicate_links": duplicate_links,
                }, status=400)

            # 4) Remaining numeric minimums
            for field, minimum in SALES_MINIMUMS.items():
                raw_value = report_data.get(field)
                numeric_value = _int_or_none(raw_value)
                if numeric_value is None:
                    # Keep the error consistent with other minimum failures
                    invalid_fields.append({'field': field, 'minimum': minimum, 'actual': raw_value})
                    continue
                if numeric_value < minimum:
                    invalid_fields.append({'field': field, 'minimum': minimum, 'actual': numeric_value})

            if invalid_fields:
                return Response({
                    'error': 'Sales daily report is not meeting compulsory targets.',
                    'invalid_fields': invalid_fields,
                }, status=400)

        update = DailyUpdate.objects.create(
            employee=request.user.employee,
            update_text=text,
            report_data=report_data if isinstance(report_data, dict) else None,
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