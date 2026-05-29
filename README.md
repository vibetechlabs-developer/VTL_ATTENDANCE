# VTL Attendance - Face Recognition & Geofenced Attendance System

Welcome to the **VTL Attendance Management System**, a premium, modern, and production-grade face verification and geofenced attendance tracking application. Designed with high-performance metrics, robust session controls, and automated sales target reporting, this system ensures maximum accountability and real-time synchronization.

---

## 🚀 Key Features

### 👤 Employee Face Recognition Check-In/Out
*   **Biometric Scanning**: Real-time biometric face scans compare front-end camera captures against 128-dimensional profile face encodings.
*   **dim-Lighting Optimization**: Powered by CLAHE (Contrast Limited Adaptive Histogram Equalization) contrast normalization to detect faces in low or dark ambient lighting.
*   **Smart Mirroring**: Supports mirrored checking (flipping camera frames horizontally) to avoid capture mismatch.

### 📍 Multi-Office Geofencing Verification
*   **Location Guards**: Ensures employees are physically present within a configured office branch using high-accuracy geodesic geofencing checks.
*   **Custom Radius**: Fully supports multiple corporate branches, checking coordinate distances against branch-specific customized radiuses or a standard 500-meter safety bounds.
*   **WFH Compatibility**: Integrates a seamless override flag for approved remote/work-from-home team members.

### ⏱️ Session & Break Management
*   **Auto-Resume Clock**: Standardized breaks end automatically after 1 hour (`MAX_BREAK_DURATION_MINUTES = 60`) keeping calculations completely accurate.
*   **Sales Team Call Tracking**: Sales representatives can toggle active phone calls, which automatically pauses idle break countdown timers on the fly.

### 📊 Strict Accountability & Target Tracking
*   **Sales checkout metrics**: Daily check-out validates mandatory daily sales quotas (call logs, meetings, LinkedIn data extractions, and unique, non-duplicated link checking).
*   **Performance Appraisals**: Multi-manager ratings allow HR and administrators to directly share rated feedback with team members.

---

## 🛠️ Technology Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Backend Framework** | Django + DRF | Python-based RESTful API service. |
| **Database** | PostgreSQL | Robust production relational database. |
| **Biometrics Engine** | `dlib` + `face-recognition` | Python HOG face encodings and dlib matching. |
| **Frontend Framework** | React 18 + TypeScript | Componentized architecture with type-safety. |
| **Build Tooling** | Vite | Rapid bundler and hot module reload. |
| **Styling & UI** | Tailwind CSS + Shadcn | harmonious dark theme, custom gradients, and spring animations. |
| **State & Fetching** | Zustand + TanStack Query | Global store syncing and server-state caching. |

---

## ⚙️ Project Setup & Installation

### 1. Prerequisites
Ensure you have the following installed on your target machine:
*   **Python 3.10+** (including C/C++ compiler tools for building the native `dlib` library).
*   **Node.js 18+** & **npm** / **bun**.
*   **PostgreSQL 14+** running locally or remotely.

---

### 2. Backend Installation

1.  **Navigate into the backend directory**:
    ```bash
    cd backend
    ```
2.  **Create and activate a virtual environment**:
    ```bash
    python -m venv venv
    # On Windows:
    venv\Scripts\activate
    # On Unix/macOS:
    source venv/bin/activate
    ```
3.  **Install requirements**:
    ```bash
    pip install -r requirements.txt
    ```
4.  **Database Configuration**:
    Configure your PostgreSQL credentials in `attendance_backend/settings.py` or through your environmental variables:
    ```python
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': 'attendance_db',
            'USER': 'attendance_user',   
            'PASSWORD': 'Attendance@123', 
            'HOST': 'localhost',
            'PORT': '5432',
        }
    }
    ```
5.  **Run Migrations**:
    ```bash
    python manage.py migrate
    ```
6.  **Create an Admin Superuser**:
    ```bash
    python manage.py createsuperuser
    ```
7.  **Start Django API Server**:
    ```bash
    python manage.py runserver
    ```

---

### 3. Frontend Installation

1.  **Navigate into the frontend directory**:
    ```bash
    cd ../frontend
    ```
2.  **Install dependencies**:
    ```bash
    npm install
    # or using Bun:
    bun install
    ```
3.  **Start Frontend Dev Server**:
    ```bash
    npm run dev
    # or using Bun:
    bun run dev
    ```

---

## 🧪 Testing Suites

### Running Backend API Tests
Run the Django testing suite to verify geofencing distance thresholds and API check-in parameters:
```bash
cd backend
venv\Scripts\python manage.py test
```

### Running Frontend Tests & Lint
Run the frontend Vitest tests and check for lint compliance:
```bash
cd frontend
# Run unit tests
npm run test
# Run linter
npm run lint
```
