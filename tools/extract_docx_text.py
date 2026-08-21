from pathlib import Path
import sys

from docx import Document


def main() -> None:
    path = Path(sys.argv[1])
    doc = Document(path)
    for index, paragraph in enumerate(doc.paragraphs):
        text = paragraph.text.strip()
        if text:
            print(f"{index:04d}: {text}")


if __name__ == "__main__":
    main()
