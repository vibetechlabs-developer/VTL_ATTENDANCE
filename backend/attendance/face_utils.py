try:
    import face_recognition
except ImportError:  # optional in dev environments
    face_recognition = None
from django.conf import settings
import base64
import logging
import threading
from io import BytesIO

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

# dlib / face_recognition can crash on Windows if called concurrently — serialize access.
_FACE_LOCK = threading.Lock()
MAX_FACE_IMAGE_SIDE = 720
MAX_B64_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB decoded cap

# dlib model used by face_recognition.face_encodings()
EXPECTED_ENCODING_DIM = 128


def resize_for_face_recognition(image):
    """Downscale large mobile photos so face_recognition stays fast and stable."""
    img = np.asarray(image)
    if img.ndim != 3:
        return img
    h, w = img.shape[:2]
    longest = max(h, w)
    if longest <= MAX_FACE_IMAGE_SIDE:
        return np.ascontiguousarray(img, dtype=np.uint8)
    scale = MAX_FACE_IMAGE_SIDE / float(longest)
    new_w = max(1, int(w * scale))
    new_h = max(1, int(h * scale))
    resized = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)
    return np.ascontiguousarray(resized, dtype=np.uint8)


def is_valid_stored_encoding(raw) -> bool:
    """True only for a usable 128-float face embedding from the DB."""
    return normalize_stored_face_encoding(raw) is not None


def normalize_stored_face_encoding(raw):
    """
    Return a (128,) float64 vector suitable for face_distance, or None if invalid.
    Guards against corrupt / partial JSON so we never compare garbage embeddings.
    """
    if raw is None:
        return None
    try:
        arr = np.asarray(raw, dtype=np.float64).reshape(-1)
    except (ValueError, TypeError):
        return None
    if arr.size != EXPECTED_ENCODING_DIM:
        return None
    if not np.all(np.isfinite(arr)):
        return None
    return arr


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
    if len(img_bytes) > MAX_B64_IMAGE_BYTES:
        raise ValueError(
            "The camera image is too large. Please retry the scan."
        )

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
    image = resize_for_face_recognition(image)
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

    def try_encode(img):
        # Try a few detector settings to reduce false "face not detected" failures.
        for upsample in (1, 2):
            for model in ("hog",):  # keep hog for CPU stability/perf
                try:
                    locs = face_recognition.face_locations(
                        img,
                        number_of_times_to_upsample=upsample,
                        model=model,
                    )
                    if not locs:
                        continue
                    encs = face_recognition.face_encodings(img, known_face_locations=locs)
                    if encs:
                        return encs[0]
                except Exception:
                    logger.debug("face_locations/encodings attempt failed", exc_info=True)
                    continue
        return None

    with _FACE_LOCK:
        # 1) Primary attempt
        enc = try_encode(image)
        if enc is not None:
            return enc

        # 2) Fallback: improve contrast/brightness for dim mobile camera frames
        try:
            ycrcb = cv2.cvtColor(image, cv2.COLOR_RGB2YCrCb)
            y, cr, cb = cv2.split(ycrcb)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            y = clahe.apply(y)
            enhanced = cv2.cvtColor(cv2.merge((y, cr, cb)), cv2.COLOR_YCrCb2RGB)
            enhanced = np.ascontiguousarray(enhanced, dtype=np.uint8)
            enc = try_encode(enhanced)
            if enc is not None:
                return enc
        except Exception:
            logger.debug("CLAHE face encode fallback failed", exc_info=True)

        # 3) Final fallback: slightly upscale frame to help tiny-face detection
        try:
            h, w = image.shape[:2]
            upscaled = cv2.resize(image, (max(1, w * 2), max(1, h * 2)), interpolation=cv2.INTER_CUBIC)
            upscaled = np.ascontiguousarray(upscaled, dtype=np.uint8)
            enc = try_encode(upscaled)
            if enc is not None:
                return enc
        except Exception:
            logger.debug("Upscale face encode fallback failed", exc_info=True)

    return None  # Face j na dikhe to


def match_face(live_encoding, all_employees):
    _ensure_face_lib()
    # Live face ne DB na badhaj employees sathe compare karo
    if not all_employees:
        return None, None

    known_encodings = []
    employees = []

    for emp in all_employees:
        vec = normalize_stored_face_encoding(emp.face_encoding)
        if vec is not None:
            known_encodings.append(vec)
            employees.append(emp)

    if not known_encodings:
        return None, None

    # Compare karo
    distances = face_recognition.face_distance(
        known_encodings,
        live_encoding
    )

    best_index = int(np.argmin(distances))
    best_distance = float(distances[best_index])

    # Lower threshold = stricter matching (reduce false positives).
    threshold = float(getattr(settings, "FACE_MATCH_THRESHOLD", 0.55))

    if best_distance <= threshold:
        return employees[best_index], round(best_distance, 3)

    # Return best_distance for better error messaging/debugging.
    return None, round(best_distance, 3)


def match_face_from_image(image, all_employees):
    """
    Match live camera frame to stored embeddings.
    Tries both original and horizontally flipped frames so check-in works whether
    the face was registered from Profile (unflipped) or admin capture (varies).
    """
    if image is None or not all_employees:
        return None, None

    try:
        image = resize_for_face_recognition(np.asarray(image))
        if image.ndim != 3:
            return None, None

        best_distance = None
        variants = [image]
        try:
            variants.append(np.fliplr(image.copy()))
        except Exception:
            logger.debug("Could not mirror image for face match", exc_info=True)

        for variant in variants:
            live_encoding = get_face_encoding(variant)
            if live_encoding is None:
                continue
            matched, distance = match_face(live_encoding, all_employees)
            if matched is not None:
                return matched, distance
            if distance is not None and (best_distance is None or distance < best_distance):
                best_distance = distance

        return None, best_distance
    except Exception:
        logger.exception("match_face_from_image failed")
        raise RuntimeError(
            "Face processing failed. Please retry in a moment."
        ) from None