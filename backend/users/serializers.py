from rest_framework import serializers
from django.db import transaction
from django.utils.crypto import get_random_string
from .models import User, Employee


def _manager_users_from_employee_ids(employee_ids):
    if not employee_ids:
        return []
    seen = set()
    users = []
    for emp in Employee.objects.select_related('user').filter(id__in=employee_ids):
        if emp.user_id and emp.user_id not in seen:
            seen.add(emp.user_id)
            users.append(emp.user)
    return users


def _format_reports_to(employee):
    names = []
    for mgr in employee.managers.select_related('employee').all():
        if getattr(mgr, 'employee', None) and mgr.employee.name:
            names.append(mgr.employee.name.strip())
        elif mgr.email:
            names.append(mgr.email)
    if names:
        return ', '.join(names)
    if getattr(employee, 'manager', None) and getattr(employee.manager, 'employee', None):
        return employee.manager.employee.name
    if getattr(employee, 'manager', None):
        return employee.manager.email
    return '—'


def _manager_employee_ids(employee):
    ids = []
    for mgr in employee.managers.select_related('employee').all():
        if hasattr(mgr, 'employee') and mgr.employee:
            ids.append(mgr.employee.id)
    if ids:
        return ids
    if getattr(employee, 'manager', None) and hasattr(employee.manager, 'employee'):
        return [employee.manager.employee.id]
    return []


def _apply_managers(employee, manager_employee_ids=None, manager_user=None, legacy_manager_id=None, legacy_manager_employee_id=None):
    """Set managers M2M and sync primary manager FK from employee id list or legacy single fields."""
    ids = list(manager_employee_ids or [])
    if not ids and legacy_manager_employee_id:
        ids = [legacy_manager_employee_id]
    manager_users = _manager_users_from_employee_ids(ids)
    if not manager_users and manager_user:
        manager_users = [manager_user]
    if not manager_users and legacy_manager_id:
        u = User.objects.filter(id=legacy_manager_id).first()
        if u:
            manager_users = [u]
    employee.managers.set(manager_users)
    employee.manager = manager_users[0] if manager_users else None
from attendance.face_utils import is_valid_stored_encoding

class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'role']

class EmployeeSerializer(serializers.ModelSerializer):
    user = UserSerializer()
    
    class Meta:
        model = Employee
        fields = ['id', 'name', 'department', 'phone', 'profile_photo']


class EmployeeListSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source='user.email', read_only=True)
    role = serializers.CharField(source='user.role', read_only=True)
    empId = serializers.SerializerMethodField()
    avatar = serializers.SerializerMethodField()
    faceStatus = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    reportsTo = serializers.SerializerMethodField()
    joiningDate = serializers.DateTimeField(source='created_at', format='%Y-%m-%d', read_only=True)
    isWfh = serializers.BooleanField(source='is_wfh', read_only=True)

    class Meta:
        model = Employee
        fields = [
            'id',
            'name',
            'email',
            'empId',
            'role',
            'department',
            'reportsTo',
            'joiningDate',
            'faceStatus',
            'avatar',
            'status',
            'isWfh',
        ]

    def get_empId(self, obj):
        return f"VTL-{str(obj.pk).zfill(3)}"

    def get_avatar(self, obj):
        request = self.context.get('request')
        if obj.profile_photo and request:
            return request.build_absolute_uri(obj.profile_photo.url)
        return None

    def get_faceStatus(self, obj):
        return 'registered' if is_valid_stored_encoding(obj.face_encoding) else 'pending'

    def get_status(self, obj):
        return 'active'

    def get_reportsTo(self, obj):
        return _format_reports_to(obj)


class EmployeeCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=['admin', 'manager', 'employee', 'hr', 'sales'])
    department = serializers.CharField(max_length=100)
    phone = serializers.CharField(max_length=15, required=False, allow_blank=True, default='')
    password = serializers.CharField(required=False, allow_blank=True, write_only=True)
    manager_id = serializers.IntegerField(required=False, allow_null=True)
    manager_employee_id = serializers.IntegerField(required=False, allow_null=True)
    manager_employee_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=True,
    )
    is_wfh = serializers.BooleanField(required=False, default=False)

    def validate_name(self, value):
        name = (value or "").strip()
        if not name:
            raise serializers.ValidationError("Full name is required.")
        if len(name) < 2:
            raise serializers.ValidationError("Full name must be at least 2 characters.")
        return name

    def validate_email(self, value):
        email = (value or "").strip().lower()
        if User.objects.filter(email=email).exists():
            raise serializers.ValidationError("This email is already in use.")
        return email

    def validate_department(self, value):
        dept = (value or "").strip()
        allowed = {"Sales", "HR", "Tech"}
        if dept not in allowed:
            raise serializers.ValidationError("Department must be Sales, HR, or Tech.")
        return dept

    def validate_password(self, value):
        pwd = (value or "").strip()
        if pwd and len(pwd) < 8:
            raise serializers.ValidationError("Password must be at least 8 characters.")
        return pwd

    @transaction.atomic
    def create(self, validated_data):
        email = validated_data['email']
        local = email.split('@')[0]
        username = local
        suffix = 1
        while User.objects.filter(username=username).exists():
            suffix += 1
            username = f"{local}{suffix}"

        provided_password = (validated_data.get('password') or '').strip()
        temp_password = provided_password if provided_password else get_random_string(10)
        user = User.objects.create_user(
            username=username,
            email=email,
            password=temp_password,
            role=validated_data['role'],
        )
        employee = Employee.objects.create(
            user=user,
            name=validated_data['name'],
            department=validated_data['department'],
            phone=validated_data.get('phone', '').strip(),
            is_wfh=bool(validated_data.get('is_wfh', False)),
        )
        _apply_managers(
            employee,
            manager_employee_ids=validated_data.get('manager_employee_ids'),
            legacy_manager_id=validated_data.get('manager_id'),
            legacy_manager_employee_id=validated_data.get('manager_employee_id'),
        )
        employee.save()
        return employee, temp_password


class EmployeeUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100, required=False)
    email = serializers.EmailField(required=False)
    role = serializers.ChoiceField(choices=['admin', 'manager', 'employee', 'hr', 'sales'], required=False)
    department = serializers.CharField(max_length=100, required=False)
    phone = serializers.CharField(max_length=15, required=False, allow_blank=True)
    password = serializers.CharField(required=False, allow_blank=True, write_only=True)
    manager_id = serializers.IntegerField(required=False, allow_null=True)
    manager_employee_id = serializers.IntegerField(required=False, allow_null=True)
    manager_employee_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=True,
    )
    is_wfh = serializers.BooleanField(required=False)

    def update(self, instance, validated_data):
        user = instance.user
        if 'email' in validated_data:
            user.email = validated_data['email'].strip().lower()
        if 'role' in validated_data:
            user.role = validated_data['role']
        if 'password' in validated_data:
            new_password = (validated_data.get('password') or '').strip()
            if new_password:
                user.set_password(new_password)
        user.save()

        if 'name' in validated_data:
            instance.name = validated_data['name'].strip()
        if 'department' in validated_data:
            instance.department = validated_data['department'].strip()
        if 'phone' in validated_data:
            instance.phone = validated_data['phone'].strip()
        if 'is_wfh' in validated_data:
            instance.is_wfh = bool(validated_data['is_wfh'])

        has_me_ids = 'manager_employee_ids' in validated_data
        has_me = 'manager_employee_id' in validated_data
        has_mid = 'manager_id' in validated_data
        if has_me_ids or has_me or has_mid:
            _apply_managers(
                instance,
                manager_employee_ids=validated_data.get('manager_employee_ids') if has_me_ids else None,
                legacy_manager_id=validated_data.get('manager_id') if has_mid else None,
                legacy_manager_employee_id=validated_data.get('manager_employee_id') if has_me else None,
            )

        instance.save()
        return instance