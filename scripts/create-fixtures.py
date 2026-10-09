from pathlib import Path
from io import BytesIO
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw
from pypdf import PdfReader, PdfWriter

target = Path(__file__).resolve().parent.parent / 'tmp' / 'pdfs'
target.mkdir(parents=True, exist_ok=True)

def make_doc(name, count, width):
    stream = canvas.Canvas(str(target / name), pagesize=(width, 700))
    for index in range(count):
        stream.setPageSize((width + index * 10, 700))
        stream.setFillColorRGB(.25, .35, .72)
        stream.setFont('Helvetica-Bold', 32)
        stream.drawString(40, 620, f'{name[0]} - PAGE {index + 1}')
        stream.setFillColorRGB(.5, .55, .65)
        stream.setFont('Helvetica', 13)
        stream.drawString(40, 585, 'Searchable text / original page content')
        stream.line(40, 565, width - 40, 565)
        stream.showPage()
    stream.save()

make_doc('A.pdf', 3, 500)
make_doc('B.pdf', 2, 800)
(target / 'broken.pdf').write_bytes(b'not a pdf')
encrypted = PdfWriter()
encrypted.append(PdfReader(target / 'A.pdf'))
encrypted.encrypt('test-password')
with open(target / 'encrypted.pdf', 'wb') as output:
    encrypted.write(output)

scan = canvas.Canvas(str(target / 'scan-large.pdf'), pagesize=(595, 842))
for index in range(160):
    image = Image.effect_noise((900, 1270), 12).convert('RGB')
    drawing = ImageDraw.Draw(image)
    drawing.rectangle((80, 80, 820, 300), fill='white')
    drawing.text((100, 130), f'SCANNED DOCUMENT - PAGE {index + 1}', fill='black', font_size=30)
    for row in range(15):
        drawing.line((100, 350 + row * 45, 780, 350 + row * 45), fill='#777777', width=2)
    buffer = BytesIO()
    image.save(buffer, format='JPEG', quality=65)
    scan.drawImage(ImageReader(buffer), 0, 0, width=595, height=842)
    scan.showPage()
scan.save()
for file in sorted(target.glob('*.pdf')):
    print(f'{file.name}: {file.stat().st_size / 1024 / 1024:.2f} MB')
