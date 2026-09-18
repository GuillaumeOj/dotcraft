"""Transactional e-mails.

Templates are versioned in this repository (``accounts/templates/emails/<name>/``)
and rendered by Django; the provider (Brevo in production) only delivers them.
Each template directory holds ``subject.txt``, ``body.txt`` and ``body.html``.
"""

from typing import Any

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils.http import urlsafe_base64_encode

from accounts.models import User


def send_templated_email(template: str, to: str, context: dict[str, Any]) -> None:
    base = f"emails/{template}"
    full_context = {"frontend_url": settings.FRONTEND_URL, **context}
    subject = " ".join(render_to_string(f"{base}/subject.txt", full_context).split())
    text = render_to_string(f"{base}/body.txt", full_context)
    html = render_to_string(f"{base}/body.html", full_context)
    message = EmailMultiAlternatives(subject=subject, body=text, from_email=settings.DEFAULT_FROM_EMAIL, to=[to])
    message.attach_alternative(html, "text/html")
    message.send()


def password_reset_link(user: User) -> str:
    uid = urlsafe_base64_encode(str(user.pk).encode())
    token = default_token_generator.make_token(user)
    return f"{settings.FRONTEND_URL}/reset-password/{uid}/{token}"


def send_password_reset(user: User) -> None:
    send_templated_email("password_reset", user.email, {"user": user, "reset_url": password_reset_link(user)})


def send_email_changed(old_email: str, new_email: str) -> None:
    send_templated_email("email_changed", old_email, {"old_email": old_email, "new_email": new_email})
