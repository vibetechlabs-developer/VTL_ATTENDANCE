from typing import Iterable

from django.conf import settings

from pywebpush import WebPushException, webpush

from .models import PushSubscription


def send_push_message(subscriptions: Iterable[PushSubscription], payload: str) -> int:
    sent = 0
    vapid_private = getattr(settings, "WEB_PUSH_PRIVATE_KEY", "")
    vapid_claims = {"sub": getattr(settings, "WEB_PUSH_SUBJECT", "mailto:admin@example.com")}
    if not vapid_private:
        return 0

    for sub in subscriptions:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload,
                vapid_private_key=vapid_private,
                vapid_claims=vapid_claims,
            )
            sent += 1
        except WebPushException as ex:
            status = getattr(getattr(ex, "response", None), "status_code", None)
            # Subscription expired/invalid on client side.
            if status in (404, 410):
                sub.delete()
    return sent
