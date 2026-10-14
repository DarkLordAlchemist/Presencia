"""Turns a still photo into a short .y4m clip for Chromium's fake camera
(--use-file-for-fake-video-capture), so the web app's Security e2e test can
point a camera tile at a real scene. Usage:
    python scripts/make_fake_camera.py <in.jpg> <out.y4m>
"""
import sys

import cv2

FRAMES = 30  # Chromium loops the clip; one second at 30 fps is plenty for a still


def main(src: str, dst: str):
    img = cv2.imread(src)
    if img is None:
        sys.exit(f"could not read {src}")
    h, w = img.shape[:2]
    img = img[: h - h % 2, : w - w % 2]  # 4:2:0 needs even dimensions
    h, w = img.shape[:2]
    yuv = cv2.cvtColor(img, cv2.COLOR_BGR2YUV_I420).tobytes()
    with open(dst, "wb") as f:
        f.write(f"YUV4MPEG2 W{w} H{h} F30:1 Ip A1:1 C420jpeg\n".encode())
        for _ in range(FRAMES):
            f.write(b"FRAME\n")
            f.write(yuv)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
