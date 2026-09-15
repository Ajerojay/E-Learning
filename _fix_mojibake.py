from pathlib import Path

files = [
    Path("src/MobileApp/pages/Student/PhonicsQuestPage.tsx"),
    Path("src/MobileApp/pages/Student/LogicQuestPage.tsx"),
    Path("src/MobileApp/pages/Student/ColorsQuestPage.tsx"),
    Path("src/MobileApp/pages/Student/ShapesQuestPage.tsx"),
    Path("src/MobileApp/pages/Student/NumbersQuestPage.tsx"),
    Path("src/MobileApp/pages/Student/LetterQuestPage.tsx"),
    Path("src/MobileApp/pages/Student/LogicQuestPage.css"),
]


def repair(text: str) -> str:
    try:
        return text.encode("cp1252").decode("utf-8")
    except UnicodeError:
        out = []
        buf = []

        def flush():
            if not buf:
                return
            chunk = "".join(buf)
            buf.clear()
            try:
                out.append(chunk.encode("cp1252").decode("utf-8"))
            except UnicodeError:
                out.append(chunk)

        for ch in text:
            try:
                ch.encode("cp1252")
            except UnicodeEncodeError:
                flush()
                out.append(ch)
            else:
                buf.append(ch)
        flush()
        return "".join(out)


for path in files:
    if not path.exists():
        print("missing", path)
        continue
    original = path.read_text(encoding="utf-8")
    fixed = repair(original)
    if fixed == original:
        print("unchanged", path)
        continue
    path.write_text(fixed, encoding="utf-8", newline="\n")
    print("fixed", path)
