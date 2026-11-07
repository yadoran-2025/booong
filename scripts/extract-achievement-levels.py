"""Extract original level-table cells from the checked-in NCIC PDFs (pdfplumber)."""
import json
import re
from collections import Counter
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
curriculum = json.loads((ROOT / "data/curriculum.json").read_text())
# Last page before example assessment tools; pages are relative to each excerpt.
COURSES = {
    "사회1": (75, 4, [f"지리:{n}" for n in range(1, 13)] + [f"middle:{n}" for n in range(1, 13)]),
    "통합사회1": (14, 4, None), "통합사회2": (17, 4, None),
    "사회와문화": (16, 6, None), "정치": (14, 6, None),
    "법과사회": (13, 6, None), "경제": (13, 6, None),
    "국제관계의이해": (13, 6, None), "사회문제탐구": (13, 6, None),
    "금융과경제생활": (13, 6, None),
}


def text(page, bbox):
    x0, y0, x1, y1 = bbox
    # Characters can cross a cell border; assign them once by their center.
    cell = page.filter(lambda obj: obj["object_type"] != "char" or (x0 <= (obj["x0"] + obj["x1"]) / 2 < x1 and y0 <= (obj["top"] + obj["bottom"]) / 2 < y1)).crop(bbox)
    return re.sub(r"\s+", " ", cell.extract_text(x_tolerance=2) or "").strip()


def code(value):
    return re.search(r"\[[^\[\]]+?\d{2}-\d{2}\]", re.sub(r"\s", "", value))


result = {"standards": {}, "domains": {}}
titles = {}
for subject, (last, offset, domain_ids) in COURSES.items():
    doc = curriculum["evaluation"][subject]
    start = doc["sourcePages"][0]
    domain_ids = domain_ids or [f"{subject}:{n}" for n in range(1, 6 if subject.startswith("통합") else 5)]
    domain_index = -1
    current_standard = current_domain = None
    with pdfplumber.open(ROOT / "assets/curriculum" / doc["url"]) as pdf:
        for number in range(1, last + 1):
            page = pdf.pages[number - 1]
            for table in page.find_tables():
                header = re.sub(r"\s", "", "".join(cell or "" for cell in table.extract()[0]))
                if header not in ("성취기준성취기준별성취수준", "영역영역별성취수준"):
                    continue
                rows = table.rows[1:]
                left_end = table.rows[0].cells[0][2]
                extracted = []
                if header.startswith("성취기준"):
                    # The PDF draws the level label cells, but omits some text-cell borders.
                    groups = []
                    for row in rows:
                        label_cell = row.cells[-1]
                        label = text(page, label_cell)
                        if not label:
                            label = groups[-1][-1][0] if groups else result["standards"][current_standard]["rows"][-1]["level"]
                        assert label in "ABCDE" and len(label) == 1, (subject, number, label)
                        if not groups or label == "A":
                            groups.append([])
                        groups[-1].append((label, label_cell))
                    for group in groups:
                        left = text(page, (table.bbox[0], group[0][1][1], left_end, group[-1][1][3]))
                        found = code(left)
                        if found:
                            current_standard = found.group()
                            assert current_standard not in result["standards"], current_standard
                            result["standards"][current_standard] = {"rows": [], "pages": [], "standard": left.split("※", 1)[0].strip(), "note": left.split("※", 1)[1].strip() if "※" in left else ""}
                        assert current_standard, (subject, number, left)
                        record = result["standards"][current_standard]
                        if not found and left:
                            record["standard"] += " " + left.split("※", 1)[0].strip()
                            if "※" in left:
                                record["note"] = left.split("※", 1)[1].strip()
                        for label, cell in group:
                            value = text(page, (cell[2], cell[1], table.bbox[2], cell[3]))
                            extracted.append(value)
                            assert len(value) > 10, (subject, number, label, value)
                            if record["rows"] and record["rows"][-1]["level"] == label:
                                record["rows"][-1]["text"] += " " + value
                            else:
                                record["rows"].append({"level": label, "text": value})
                        record["pages"].append(number)
                else:
                    level = result["domains"][current_domain]["rows"][-1]["level"] if current_domain else None
                    for row in rows:
                        category_cell = row.cells[-1]
                        label_cell = row.cells[-2]
                        if label_cell and text(page, label_cell):
                            level = text(page, label_cell)
                            assert level in "ABCDE" and len(level) == 1, (subject, number, level)
                            if level == "A" and (not current_domain or result["domains"][current_domain]["rows"][-1]["level"] != "A"):
                                domain_index += 1
                                current_domain = domain_ids[domain_index]
                                result["domains"][current_domain] = {"rows": [], "pages": []}
                        assert current_domain and level, (subject, number)
                        category = text(page, category_cell)
                        category = next((name for key, name in [("지식", "지식·이해"), ("과정", "과정·기능"), ("가치", "가치·태도")] if key in category), category)
                        assert category in ["", "지식·이해", "과정·기능", "가치·태도"], (subject, number, category)
                        value = text(page, (category_cell[2], category_cell[1], table.bbox[2], category_cell[3]))
                        extracted.append(value)
                        assert len(value) > 5, (subject, number, value)
                        record = result["domains"][current_domain]
                        if not category:
                            record["rows"][-1]["text"] += " " + value
                        else:
                            record["rows"].append({"level": level, "category": category, "text": value})
                        record["pages"].append(number)
                    titles.setdefault(current_domain, []).append(text(page, (table.bbox[0], table.rows[0].bbox[3], left_end, table.bbox[3])))
                content_start = rows[0].cells[-1][2]
                original = text(page, (content_start, table.rows[0].bbox[3], table.bbox[2], table.bbox[3]))
                assert Counter(re.sub(r"\s", "", original)) == Counter(re.sub(r"\s", "", "".join(extracted))), (subject, number, "Lost or duplicated table text")
            page.close()
    assert domain_index + 1 == len(domain_ids), (subject, domain_index, domain_ids)
    for domain_id in domain_ids:
        normalize = lambda value: re.sub(r"[\W_]", "", value)
        # NCIC's common-course report uses this earlier heading for the same 05 codes.
        title = "생활공간의 변화" if domain_id == "통합사회1:5" else curriculum["domains"][domain_id]["title"]
        assert normalize(title) in normalize(" ".join(titles[domain_id])), (domain_id, titles[domain_id])
        result["domains"][domain_id]["title"] = title
    for record in [*result["standards"].values(), *result["domains"].values()]:
        if "source" in record:
            continue
        record["pages"] = sorted(set(record["pages"]))
        record["printedPages"] = [page + start - 1 - offset for page in record["pages"]]
        record["source"] = doc["url"]
    print(subject, "domains", domain_index + 1, flush=True)

for chapter in curriculum["chapters"].values():
    domain = curriculum["domains"][chapter["domain"]]
    if domain["version"] != 2022:
        continue
    assert chapter["domain"] in result["domains"]
    for standard in domain["standards"]:
        record = result["standards"][standard["code"]]
        assert [row["level"] for row in record["rows"]] in [list("ABCDE"), list("ABC")], standard["code"]

(ROOT / "data/achievement-levels.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
print("Extracted", len(result["standards"]), "standards and", len(result["domains"]), "domains")
