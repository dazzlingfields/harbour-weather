from PIL import Image, ImageDraw
from pathlib import Path

root = Path(__file__).resolve().parent.parent / 'dist'
for size in (192, 512):
    image = Image.new('RGB', (size, size), '#123c43')
    draw = ImageDraw.Draw(image)
    scale = size / 192
    def line(points, width=9):
        draw.line([(round(x*scale), round(y*scale)) for x,y in points], fill='#d4f1c3', width=round(width*scale), joint='curve')
    line([(96,50),(96,135)])
    line([(67,75),(125,75)])
    line([(49,108),(51,125),(59,139),(76,148),(96,151),(116,148),(133,139),(141,125),(143,108)])
    line([(36,122),(49,108),(63,122)])
    line([(129,122),(143,108),(156,122)])
    image.save(root / f'icon-{size}.png')
