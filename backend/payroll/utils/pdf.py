import os
from django.conf import settings
from django.template.loader import render_to_string
from weasyprint import HTML


def render_payslip_to_pdf(payslip):
    """Render a Payslip instance to a PDF file and return the file path.
    The PDF is saved under MEDIA_ROOT/payslips/<payroll_run_id>/<employee_id>.pdf
    """
    # Ensure media directory exists
    base_dir = os.path.join(settings.MEDIA_ROOT, 'payslips')
    os.makedirs(base_dir, exist_ok=True)

    # Subdirectory per payroll run
    run_dir = os.path.join(base_dir, f"{payslip.payroll_run.id}")
    os.makedirs(run_dir, exist_ok=True)

    filename = f"payslip_{payslip.employee.id}_{payslip.payroll_run.month}_{payslip.payroll_run.year}.pdf"
    file_path = os.path.join(run_dir, filename)

    # Render HTML using Django template
    html_string = render_to_string('payroll/payslip.html', {'payslip': payslip})
    HTML(string=html_string).write_pdf(target=file_path)
    return file_path
