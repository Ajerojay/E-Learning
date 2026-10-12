from pathlib import Path

files = [
    Path("src/frontend/MobileApp/pages/Student/games/phonics/PhonicsQuestPage.tsx"),
    Path("src/frontend/MobileApp/pages/Student/games/logic/LogicQuestPage.tsx"),
    Path("src/frontend/MobileApp/pages/Student/games/colors/ColorsQuestPage.tsx"),
    Path("src/frontend/MobileApp/pages/Student/games/shapes/ShapesQuestPage.tsx"),
    Path("src/frontend/MobileApp/pages/Student/games/numbers/NumbersQuestPage.tsx"),
    Path("src/frontend/MobileApp/pages/Student/games/letters/LetterQuestPage.tsx"),
    Path("src/frontend/MobileApp/pages/Student/games/logic/LogicQuestPage.css"),
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
