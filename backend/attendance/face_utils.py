try:
    import face_recognition
except ImportError:  # optional in dev environments
    face_recognition = None
from django.conf import settings
import cv2
import numpy as np
import base64
from io import BytesIO
from PIL import Image


def _ensure_face_lib():
    if face_recognition is None:
        raise RuntimeError(
            "face_recognition package is not installed. "
            "Install it to use face registration and face check-in."
        )

def decode_base64_image(base64_string):
    # React webcam thi base64 image aavse
    # aa function te image ne numpy array ma convert kare
    if ',' in base64_string:
        base64_string = base64_string.split(',')[1]
    
    img_bytes = base64.b64decode(base64_string)

    # Best-effort: let face_recognition handle decoding when available
    if face_recognition is not None:
        try:
            rgb = face_recognition.load_image_file(BytesIO(img_bytes))
            return np.require(rgb, dtype=np.uint8, requirements=["C"])
        except Exception:
            pass

    # Fallback: PIL for consistent RGB decoding across formats/codecs
    try:
        img = Image.open(BytesIO(img_bytes)).convert('RGB')
        rgb = np.array(img, dtype=np.uint8)
        return np.ascontiguousarray(rgb, dtype=np.uint8)
    except Exception:
        # Last fallback: OpenCV decode
        np_arr = np.frombuffer(img_bytes, np.uint8)
        image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("Could not decode image")
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        return np.ascontiguousarray(rgb, dtype=np.uint8)


def get_face_encoding(image):
    _ensure_face_lib()
    if image is None:
        raise ValueError("Image is empty")
    image = np.asarray(image)
    if image.ndim == 2:
        image = np.stack([image, image, image], axis=-1)
    if image.ndim == 3 and image.shape[2] == 4:
        image = image[:, :, :3]
    if image.ndim != 3 or image.shape[2] != 3:
        raise ValueError("Invalid image shape")

    # Force exactly what dlib expects: uint8, 3-channel, C-contiguous
    image = np.require(image, dtype=np.uint8, requirements=["C"])
    if image.size == 0:
        raise ValueError("Image is empty")

    # Image thi 128 numbers kaadhe
    encodings = face_recognition.face_encodings(image)
    if len(encodings) == 0:
        return None  # Face j na dikhe to
    return encodings[0]


def match_face(live_encoding, all_employees):
    _ensure_face_lib()
    # Live face ne DB na badhaj employees sathe compare karo
    if not all_employees:
        return None, None

    known_encodings = []
    employees = []

    for emp in all_employees:
        if emp.face_encoding:
            known_encodings.append(np.array(emp.face_encoding))
            employees.append(emp)

    if not known_encodings:
        return None, None

    # Compare karo
    distances = face_recognition.face_distance(
        known_encodings,
        live_encoding
    )

    best_index = np.argmin(distances)
    best_distance = distances[best_index]

    # Lower threshold = stricter matching (reduce false positives).
    threshold = getattr(settings, "FACE_MATCH_THRESHOLD", 0.5)
    best_distance = float(best_distance)

    if best_distance < float(threshold):
        return employees[best_index], round(best_distance, 3)

    # Return best_distance for better error messaging/debugging.
    return None, round(best_distance, 3)