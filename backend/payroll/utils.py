import os
from decimal import Decimal
from django.conf import settings
from django.template.loader import render_to_string
try:
    from weasyprint import HTML
except Exception as e:
    # WeasyPrint (and its GTK dependencies) are optional for now.
    # PDF generation will be disabled until the library is installed.
    HTML = None
    _weasy_error = e

from num2words import num2words


def amount_to_words(amount):
    """Convert a Decimal amount to Indian Rupees words.
    Example: Decimal('12345.67') -> 'Twelve Thousand Three Hundred Forty Five Rupees and Sixty Seven Paise'
    """
    try:
        amt = Decimal(amount)
    except Exception:
        amt = Decimal('0')
    rupees = int(amt)
    paise = int((amt - rupees) * 100)
    words = []
    if rupees:
        words.append(num2words(rupees, lang='en_IN').title() + " Rupees")
    if paise:
        words.append(num2words(paise, lang='en_IN').title() + " Paise")
    if not words:
        return "Zero Rupees"
    return " and ".join(words)


def render_payslip_to_pdf(payslip):
    """Render the payslip HTML template to PDF and return the file path.
    Returns None if WeasyPrint is not available or rendering fails.
    """
    if HTML is None:
        return None
    try:
        context = {'payslip': payslip}
        html_string = render_to_string('payroll/payslip.html', context)
        output_dir = os.path.join(settings.MEDIA_ROOT, 'payslips')
        os.makedirs(output_dir, exist_ok=True)
        filename = f'payslip_{payslip.id}.pdf'
        output_path = os.path.join(output_dir, filename)
        HTML(string=html_string).write_pdf(target=output_path)
        return os.path.join('payslips', filename)
    except Exception:
        return None
