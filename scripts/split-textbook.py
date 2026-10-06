"""Split a reviewed textbook manifest. Requires the existing pypdf Python package.

Usage: python3 scripts/split-textbook.py BOOK_ID SOURCE.pdf OUTPUT_DIRECTORY
PDFs stay outside the website checkout; only metadata belongs in Git.
"""
import hashlib
from copy import copy
import json
from pathlib import Path
import sys
from io import BytesIO

from pypdf import PdfReader, PdfWriter
from pypdf.generic import RectangleObject


def reading_pages(reader, spreads):
    pages = []
    for number, page in enumerate(reader.pages, 1):
        if number not in spreads:
            pages.append(page)
            continue
        left, bottom, right, top = page.mediabox
        assert float(right - left) / float(top - bottom) > 1.2, "Reviewed spread is not landscape"
        middle = (left + right) / 2
        for first, last in [(left, middle), (middle, right)]:
            half = copy(page)
            half.mediabox = RectangleObject([first, bottom, last, top])
            half.cropbox = RectangleObject([first, bottom, last, top])
            pages.append(half)
    return pages


def split(book_id, source, output):
    manifest = Path(__file__).resolve().parent.parent / "data/textbooks.json"
    data = json.loads(manifest.read_text())
    book = next(book for book in data["books"] if book["id"] == book_id)
    source, output = Path(source).resolve(), Path(output).resolve()
    checkout = manifest.parent.parent
    assert not output.is_relative_to(checkout), "Keep private PDFs outside the public website"
    assert hashlib.sha256(source.read_bytes()).hexdigest() == book["sourceSha256"], "Source differs from reviewed PDF"
    reader = PdfReader(source)
    assert not reader.is_encrypted and len(reader.pages) == book["sourcePages"]
    pages = reading_pages(reader, book.get("spreadPages", []))
    assert len(pages) == book.get("readingPages", book["sourcePages"])
    output.mkdir(parents=True, exist_ok=True)
    for unit in book["units"]:
        for section in [unit, *unit["chapters"]]:
            first, last = section["pdfStart"], section["pdfEnd"]
            assert 1 <= first <= last <= len(pages)
            writer = PdfWriter()
            for page in pages[first - 1:last]:
                writer.add_page(page)
            writer.add_metadata({"/Title": f"{book['publisher']} · {section['title']}", "/Author": book["publisher"]})
            for chapter in section.get("chapters", []):
                writer.add_outline_item(chapter["title"], chapter["pdfStart"] - first)
            target = output / Path(section["path"]).name
            temporary = target.with_suffix(".tmp")
            with temporary.open("wb") as file:
                writer.write(file)
            assert len(PdfReader(temporary).pages) == last - first + 1
            temporary.replace(target)
            section["bytes"] = target.stat().st_size
            section["sha256"] = hashlib.sha256(target.read_bytes()).hexdigest()
            print(f"{target.name}: {last - first + 1} PDF pages, {section['bytes']:,} bytes", flush=True)
    manifest.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    if sys.argv[1:] == ["--check"]:
        original = PdfWriter()
        original.add_blank_page(width=1000, height=700)
        buffer = BytesIO()
        original.write(buffer)
        clipped = PdfWriter()
        for page in reading_pages(PdfReader(buffer), [1]):
            clipped.add_page(page)
        result = BytesIO()
        clipped.write(result)
        pages = PdfReader(result).pages
        assert len(pages) == 2
        assert list(pages[0].mediabox) == [0, 0, 500, 700]
        assert list(pages[1].mediabox) == [500, 0, 1000, 700]
        print("Spread splitting check passed")
        raise SystemExit(0)
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    split(*sys.argv[1:])
