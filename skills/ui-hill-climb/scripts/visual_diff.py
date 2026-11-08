#!/usr/bin/env python3
"""Generate a visual diff diagram with callout boxes and change clusters between two UI screenshots.

Usage:
    python3 visual_diff.py before.png after.png [out_diff.png] [--threshold 20] [--margin 10]

Creates a side-by-side comparison (Before vs After) with numbered bounding boxes
around regions with visible pixel differences, making subtle typography, spacing,
and color changes immediately obvious to human reviewers.
"""
import argparse
import sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont


def compute_diff_regions(im1, im2, threshold=25, min_area=100, cluster_dist=30):
    """Find bounding boxes of differing regions between two images of matching size."""
    # Ensure same mode and size
    w = min(im1.width, im2.width)
    h = min(im1.height, im2.height)
    i1 = im1.crop((0, 0, w, h)).convert('RGB')
    i2 = im2.crop((0, 0, w, h)).convert('RGB')

    diff = ImageChops.difference(i1, i2)
    # Convert to grayscale
    gray = diff.convert('L')
    # Threshold: anything above threshold is considered changed
    mask = gray.point(lambda p: 255 if p > threshold else 0)
    # Dilate/blur slightly to cluster nearby pixel diffs
    blurred = mask.filter(ImageFilter.MaxFilter(size=cluster_dist // 2 * 2 + 1))

    # Downsample grid to quickly extract connected components / bounding boxes
    step = 8
    gw, gh = w // step, h // step
    grid = [[False] * gw for _ in range(gh)]
    pix = blurred.load()

    for gy in range(gh):
        y = gy * step
        for gx in range(gw):
            x = gx * step
            if pix[x, y] > 0:
                grid[gy][gx] = True

    visited = [[False] * gw for _ in range(gh)]
    boxes = []

    for gy in range(gh):
        for gx in range(gw):
            if grid[gy][gx] and not visited[gy][gx]:
                # Flood fill component
                min_x, max_x = gx, gx
                min_y, max_y = gy, gy
                q = [(gx, gy)]
                visited[gy][gx] = True
                while q:
                    cx, cy = q.pop()
                    min_x = min(min_x, cx)
                    max_x = max(max_x, cx)
                    min_y = min(min_y, cy)
                    max_y = max(max_y, cy)
                    for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1), (-1, 1), (1, -1)):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < gw and 0 <= ny < gh and grid[ny][nx] and not visited[ny][nx]:
                            visited[ny][nx] = True
                            q.append((nx, ny))

                bx1, by1 = min_x * step, min_y * step
                bx2, by2 = min((max_x + 1) * step, w), min((max_y + 1) * step, h)
                area = (bx2 - bx1) * (by2 - by1)
                if area >= min_area:
                    boxes.append((bx1, by1, bx2, by2))

    # Merge overlapping or touching boxes
    merged = True
    while merged:
        merged = False
        new_boxes = []
        skip = set()
        for i in range(len(boxes)):
            if i in skip:
                continue
            b1 = boxes[i]
            for j in range(i + 1, len(boxes)):
                if j in skip:
                    continue
                b2 = boxes[j]
                # Check distance
                pad = 15
                if not (b1[2] + pad < b2[0] or b2[2] + pad < b1[0] or b1[3] + pad < b2[1] or b2[3] + pad < b1[1]):
                    # Merge
                    b1 = (min(b1[0], b2[0]), min(b1[1], b2[1]), max(b1[2], b2[2]), max(b1[3], b2[3]))
                    skip.add(j)
                    merged = True
            new_boxes.append(b1)
        boxes = new_boxes

    # Sort top-to-bottom, left-to-right
    boxes.sort(key=lambda b: (b[1] // 50, b[0]))
    return boxes, w, h


def draw_visual_diff(im1_path, im2_path, out_path, threshold=20):
    im1 = Image.open(im1_path)
    im2 = Image.open(im2_path)

    boxes, w, h = compute_diff_regions(im1, im2, threshold=threshold)

    # Base images cropped to common width/height
    c1 = im1.crop((0, 0, w, h)).convert('RGBA')
    c2 = im2.crop((0, 0, w, h)).convert('RGBA')

    # Create composite canvas: header (60px) + side-by-side (w * 2 + 30px separator)
    pad = 20
    header_h = 50
    total_w = w * 2 + pad * 3
    total_h = h + header_h + pad * 2

    canvas = Image.new('RGBA', (total_w, total_h), (24, 24, 27, 255)) # Dark neutral slate background
    draw = ImageDraw.Draw(canvas)

    # Paste base screenshots
    x1 = pad
    y1 = header_h + pad
    x2 = pad * 2 + w
    y2 = header_h + pad

    canvas.paste(c1, (x1, y1))
    canvas.paste(c2, (x2, y2))

    # Header labels
    try:
        font = ImageFont.load_default()
    except Exception:
        font = None

    draw.text((x1 + 10, pad + 12), "BEFORE (Baseline)", fill=(220, 220, 225, 255), font=font)
    draw.text((x2 + 10, pad + 12), f"AFTER (Iterated) — {len(boxes)} Changed Region(s)", fill=(74, 222, 128, 255), font=font)

    # Draw boxes & badges
    for idx, (bx1, by1, bx2, by2) in enumerate(boxes, 1):
        # Draw on before (amber highlight)
        draw.rectangle([x1 + bx1, y1 + by1, x1 + bx2, y1 + by2], outline=(245, 158, 11, 200), width=2)
        # Draw on after (emerald highlight)
        draw.rectangle([x2 + bx1, y2 + by1, x2 + bx2, y2 + by2], outline=(52, 211, 153, 230), width=2)

        # Badge pill
        badge_r = 10
        center_x = x2 + bx1 + 12
        center_y = y2 + by1 - 4 if by1 >= 14 else y2 + by1 + 12
        draw.ellipse([center_x - badge_r, center_y - badge_r, center_x + badge_r, center_y + badge_r],
                     fill=(16, 185, 129, 255), outline=(255, 255, 255, 255))
        draw.text((center_x - 4, center_y - 6), str(idx), fill=(255, 255, 255, 255), font=font)

    canvas.convert('RGB').save(out_path, quality=95)
    print(f"Visual diff generated: {out_path} ({len(boxes)} regions identified)")
    for idx, (bx1, by1, bx2, by2) in enumerate(boxes, 1):
        print(f"  [{idx}] Bounds: x={bx1}..{bx2}, y={by1}..{by2} (size: {bx2-bx1}x{by2-by1}px)")
    return len(boxes)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Create visual diff diagram between before/after UI screenshots.")
    parser.add_argument("before", help="Path to before/baseline screenshot")
    parser.add_argument("after", help="Path to after/iterated screenshot")
    parser.add_argument("output", nargs="?", default="diff_callout.png", help="Output diff image path")
    parser.add_argument("--threshold", type=int, default=20, help="Pixel difference threshold (0-255)")
    args = parser.parse_args()

    draw_visual_diff(args.before, args.after, args.output, threshold=args.threshold)
