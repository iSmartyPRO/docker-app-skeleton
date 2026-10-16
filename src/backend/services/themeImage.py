"""Re-encodes a custom-theme background with Pillow (see themeImage.js).

Usage: themeImage.py <input> <out_dir> <id>
Writes <id>.webp (long side <= 2560), <id>-m.webp (<= 1280) and
<id>-p.webp (32 px, blurred placeholder) into <out_dir>; prints one JSON
line: {"width", "height", "luma"}.
"""
import json
import os
import sys

from PIL import Image, ImageFilter, ImageOps, ImageStat

# The upload was checked to be at most 4096 x 4096 before this runs; refuse
# anything bigger the header might have hidden (decompression bombs).
Image.MAX_IMAGE_PIXELS = 4096 * 4096 + 1


def save(image, path, quality):
    tmp = path + '.tmp'
    image.save(tmp, 'WEBP', quality=quality, method=4)
    os.replace(tmp, path)


def fit(image, side):
    copy = image.copy()
    copy.thumbnail((side, side), Image.LANCZOS)
    return copy


def main():
    source, out_dir, image_id = sys.argv[1:4]
    with Image.open(source) as opened:
        if opened.format not in ('JPEG', 'PNG', 'WEBP', 'GIF'):
            raise SystemExit('unsupported format')
        opened.seek(0)
        image = ImageOps.exif_transpose(opened)
        if image.mode in ('RGBA', 'LA', 'P'):
            rgba = image.convert('RGBA')
            ground = Image.new('RGB', rgba.size, (128, 128, 128))
            ground.paste(rgba, mask=rgba.split()[-1])
            image = ground
        else:
            image = image.convert('RGB')
    width, height = image.size
    save(fit(image, 2560), os.path.join(out_dir, image_id + '.webp'), 82)
    save(fit(image, 1280), os.path.join(out_dir, image_id + '-m.webp'), 78)
    tiny = fit(image, 32).filter(ImageFilter.GaussianBlur(1.2))
    save(tiny, os.path.join(out_dir, image_id + '-p.webp'), 60)
    luma = ImageStat.Stat(fit(image, 64).convert('L')).mean[0] / 255.0
    print(json.dumps({'width': width, 'height': height, 'luma': round(luma, 3)}))


if __name__ == '__main__':
    main()
