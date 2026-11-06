#!/usr/bin/env python3
"""Lector de códigos QR con OpenCV.

Uso:
    python qr_reader.py                  # cámara 0 (webcam)
    python qr_reader.py 1                # otra cámara
    python qr_reader.py http://IP:8080/video   # cámara IP (celular con IP Webcam/DroidCam)
    python qr_reader.py --image foto.png # leer un QR desde una imagen
    python qr_reader.py --once           # termina después del primer QR
    python qr_reader.py --no-gui         # sin ventana, solo imprime en la terminal

Teclas en la ventana: q o ESC para salir.
"""
import argparse
import sys
import time

import cv2


def make_detector():
    # La versión basada en Aruco (OpenCV >= 4.8) detecta mejor; si no existe, se usa la clásica.
    if hasattr(cv2, "QRCodeDetectorAruco"):
        return cv2.QRCodeDetectorAruco()
    return cv2.QRCodeDetector()


def read_qr(detector, frame):
    """Devuelve (texto, puntos) o (None, None)."""
    for img in (frame, cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)):
        try:
            data, points, _ = detector.detectAndDecode(img)
        except cv2.error:
            continue
        if data:
            return data, points
    return None, None


def read_from_image(path):
    frame = cv2.imread(path)
    if frame is None:
        print(f"No se pudo abrir la imagen: {path}", file=sys.stderr)
        return 1
    data, _ = read_qr(make_detector(), frame)
    if data:
        print(data)
        return 0
    print("No se encontró ningún código QR en la imagen.", file=sys.stderr)
    return 2


def read_from_camera(source, once, gui):
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        print(f"No se pudo abrir la cámara: {source}", file=sys.stderr)
        return 1
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    detector = make_detector()
    last, last_time = None, 0.0
    print("Escaneando… apunta la cámara a un QR (Ctrl+C para salir).", file=sys.stderr)

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                print("No se pudo leer de la cámara.", file=sys.stderr)
                return 1

            data, points = read_qr(detector, frame)
            if data:
                now = time.time()
                # Evita imprimir el mismo código muchas veces seguidas
                if data != last or now - last_time > 3:
                    print(data, flush=True)
                    last, last_time = data, now
                    if once:
                        return 0

            if gui:
                if data and points is not None:
                    pts = points.astype(int).reshape(-1, 2)
                    cv2.polylines(frame, [pts], True, (0, 255, 0), 3)
                try:
                    cv2.imshow("Lector QR (q para salir)", frame)
                    if cv2.waitKey(1) & 0xFF in (ord("q"), 27):
                        break
                except cv2.error:
                    print("Esta instalación de OpenCV no tiene ventana; usando modo sin GUI.", file=sys.stderr)
                    gui = False
    except KeyboardInterrupt:
        pass
    finally:
        cap.release()
        if gui:
            cv2.destroyAllWindows()
    return 0


def main():
    p = argparse.ArgumentParser(description="Lee códigos QR y los imprime.")
    p.add_argument("source", nargs="?", default="0",
                   help="índice de cámara (0, 1…) o URL de video. Por defecto 0.")
    p.add_argument("--image", help="leer el QR desde una imagen en lugar de la cámara")
    p.add_argument("--once", action="store_true", help="salir después del primer QR")
    p.add_argument("--no-gui", action="store_true", help="no mostrar ventana")
    args = p.parse_args()

    if args.image:
        sys.exit(read_from_image(args.image))

    source = int(args.source) if args.source.isdigit() else args.source
    sys.exit(read_from_camera(source, args.once, not args.no_gui))


if __name__ == "__main__":
    main()