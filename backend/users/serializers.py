from rest_framework import serializers
from django.db import transaction
from django.utils.crypto import get_random_string
from .models import User, Employee

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
        ]

    def get_empId(self, obj):
        return f"VTL-{str(obj.pk).zfill(3)}"

    def get_avatar(self, obj):
        request = self.context.get('request')
        if obj.profile_photo and request:
            return request.build_absolute_uri(obj.profile_photo.url)
        return None

    def get_faceStatus(self, obj):
        return 'registered' if obj.face_encoding else 'pending'

    def get_status(self, obj):
        return 'active'

    def get_reportsTo(self, obj):
        if getattr(obj, 'manager', None) and getattr(obj.manager, 'employee', None):
            return obj.manager.employee.name
        if getattr(obj, 'manager', None):
            return obj.manager.email
        return '—'


class EmployeeCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=['admin', 'manager', 'employee', 'hr'])
    department = serializers.CharField(max_length=100)
    phone = serializers.CharField(max_length=15, required=False, allow_blank=True, default='')
    password = serializers.CharField(required=False, allow_blank=True, write_only=True)
    manager_id = serializers.IntegerField(required=False, allow_null=True)
    manager_employee_id = serializers.IntegerField(required=False, allow_null=True)

    @transaction.atomic
    def create(self, validated_data):
        email = validated_data['email'].strip().lower()
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
        manager_user = None
        if validated_data.get('manager_employee_id'):
            mgr_emp = Employee.objects.select_related('user').filter(
                id=validated_data.get('manager_employee_id')
            ).first()
            manager_user = mgr_emp.user if mgr_emp else None
        elif validated_data.get('manager_id'):
            manager_user = User.objects.filter(id=validated_data.get('manager_id')).first()

        employee = Employee.objects.create(
            user=user,
            name=validated_data['name'].strip(),
            department=validated_data['department'].strip(),
            phone=validated_data.get('phone', '').strip(),
            manager=manager_user,
        )
        return employee, temp_password


class EmployeeUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100, required=False)
    email = serializers.EmailField(required=False)
    role = serializers.ChoiceField(choices=['admin', 'manager', 'employee', 'hr'], required=False)
    department = serializers.CharField(max_length=100, required=False)
    phone = serializers.CharField(max_length=15, required=False, allow_blank=True)
    password = serializers.CharField(required=False, allow_blank=True, write_only=True)
    manager_id = serializers.IntegerField(required=False, allow_null=True)
    manager_employee_id = serializers.IntegerField(required=False, allow_null=True)

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

        # Manager: frontend often sends both keys with manager_id: null and manager_employee_id set.
        # Checking manager_id first would clear the manager and skip employee resolution.
        has_me = 'manager_employee_id' in validated_data
        has_mid = 'manager_id' in validated_data
        if has_me or has_mid:
            meid = validated_data.get('manager_employee_id') if has_me else None
            mid = validated_data.get('manager_id') if has_mid else None
            if meid:
                mgr_emp = Employee.objects.select_related('user').filter(id=meid).first()
                instance.manager = mgr_emp.user if mgr_emp else None
            elif mid:
                instance.manager = User.objects.filter(id=mid).first()
            else:
                instance.manager = None

        instance.save()
        return instance