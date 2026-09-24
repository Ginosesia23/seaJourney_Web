#!/usr/bin/env python3
"""
Extract MCA Yacht TRB (OOW Yachts <3,000 GT) signable tasks from the official PDF
and generate an additive SQL seed + JSON/Markdown manifests.

Usage:
  python3 -m venv /tmp/trb-pdf && /tmp/trb-pdf/bin/pip install pypdf
  /tmp/trb-pdf/bin/python scripts/trb/extract_oow_trb_full_book.py

Requires: docs/trb/source/training_record_book_revision_22_04-2.pdf
"""
from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PDF = ROOT / "docs/trb/source/training_record_book_revision_22_04-2.pdf"
OUT_JSON = ROOT / "docs/trb/extracted/oow-yachts-3000gt-tasks.json"
OUT_SQL = ROOT / "sql/seed-trb-oow-yachts-3000gt-full-book.sql"
OUT_MD = ROOT / "docs/trb/oow-yachts-3000gt-full-book-manifest.md"

SECTIONS = [
    dict(
        part=1,
        code="P1-RATING",
        title="Yacht Rating Certificate (Support Level Functions)",
        source_ref="PART 1 / TASKS – Yacht rating certificate (support functions)",
        pages=(24, 31),
        layout="simple",
        description=(
            "PART 1 — YACHT RATING CERTIFICATE (SUPPORT LEVEL FUNCTIONS)\n"
            "Seamanship, deck work, watchkeeping and safe working practices at the support level. "
            "Required for yacht rating certificate underpinning knowledge."
        ),
    ),
    dict(
        part=2,
        code="P2-FAM",
        title="Familiarisation and Emergency Procedures",
        source_ref="PART 2 / TASKS – Familiarisation and emergency procedures",
        pages=(32, 35),
        layout="simple",
        description=(
            "PART 2 — EMERGENCY PROCEDURES, SHIPBOARD OPERATIONS & SAFE WORKING PRACTICES\n"
            "TASKS – Familiarisation and emergency procedures at the operational level."
        ),
    ),
    dict(
        part=2,
        code="P2-OPS",
        title="Shipboard Operations",
        source_ref="PART 2 / TASKS – Shipboard operations",
        pages=(36, 44),
        layout="simple",
        description=(
            "PART 2 — SHIPBOARD OPERATIONS\n"
            "TASKS & ASSIGNMENTS for shipboard operations and safe working practice at the operational level."
        ),
    ),
    dict(
        part=2,
        code="P2-SAIL",
        title="Shipboard Operations – Sailing and Sail Training Vessels Only",
        source_ref="PART 2 / TASKS – Shipboard operations (sailing and sail training vessels only)",
        pages=(45, 48),
        layout="simple",
        description=(
            "PART 2 — SHIPBOARD OPERATIONS – SAILING AND SAIL TRAINING VESSELS ONLY\n"
            "Additional yacht-specific tasks for sailing / sail training vessels."
        ),
    ),
    dict(
        part=3,
        code="P3-PASSAGE",
        title="Plan a Passage and Conduct a Passage and Determine Position",
        source_ref="PART 3 / TASKS – Plan a passage and conduct a passage and determine position",
        pages=(49, 54),
        layout="columns",
        description=(
            "PART 3 — NAVIGATION AT OPERATIONAL LEVEL\n"
            "TASKS – Plan a passage and conduct a passage and determine position."
        ),
    ),
    dict(
        part=3,
        code="P3-WATCH",
        title="Maintain a Safe Navigational Watch",
        source_ref="PART 3 / TASKS – Maintain a Safe Navigational Watch",
        pages=(55, 57),
        layout="columns",
        skip_extract=True,
        description=(
            "PART 3 — NAVIGATION AT OPERATIONAL LEVEL\n"
            "TASKS – maintain a safe navigational watch.\n"
            "(Existing curated 12 tasks retained from prior seed.)"
        ),
    ),
    dict(
        part=3,
        code="P3-RADAR",
        title="Use Radar and ARPA to Maintain Safety of Navigation",
        source_ref="PART 3 / TASKS – Use radar and ARPA to maintain safety of navigation",
        pages=(58, 62),
        layout="columns",
        description=(
            "PART 3 — NAVIGATION AT OPERATIONAL LEVEL\n"
            "TASKS – use radar and ARPA to maintain safety of navigation.\n"
            "Page 58 contains shore-based radar/ARPA syllabus prerequisites (not signable rows)."
        ),
    ),
    dict(
        part=4,
        code="P4-MANOEUVRE",
        title="Manoeuvre the Ship",
        source_ref="PART 4 / TASKS – Manoeuvre the ship",
        pages=(63, 69),
        layout="columns",
        description=(
            "PART 4 — NAVIGATION AT OPERATIONAL LEVEL\n"
            "STCW Competence: Manoeuvre the ship."
        ),
    ),
    dict(
        part=4,
        code="P4-EMERG",
        title="Respond to Emergencies",
        source_ref="PART 4 / TASKS – Respond to emergencies",
        pages=(70, 71),
        layout="columns",
        description="PART 4 — RESPONSE TO EMERGENCIES\nTASKS – respond to emergencies.",
    ),
    dict(
        part=4,
        code="P4-FIRE",
        title="Prevent, Control and Fight Fires on Board",
        source_ref="PART 4 / TASKS – Prevent, control and fight fires on board",
        pages=(72, 72),
        layout="columns",
        description=(
            "PART 4 — RESPONSE TO EMERGENCIES\n"
            "TASKS – prevent, control and fight fires on board "
            "(contents title; printed on emergency-response pages)."
        ),
    ),
    dict(
        part=4,
        code="P4-LSA",
        title="Operate Life Saving Appliances",
        source_ref="PART 4 / TASKS – Operate life saving appliances",
        pages=(73, 73),
        layout="columns",
        description="PART 4 — RESPONSE TO EMERGENCIES\nTASKS – operate life saving appliances.",
    ),
    dict(
        part=4,
        code="P4-FIRSTAID",
        title="Apply Medical First Aid on Board",
        source_ref="PART 4 / TASKS – Apply medical first aid on board",
        pages=(74, 74),
        layout="columns",
        description="PART 4 — RESPONSE TO EMERGENCIES\nTASKS – apply medical first aid on board.",
    ),
    dict(
        part=4,
        code="P4-DISTRESS",
        title="Respond to a Distress Signal at Sea",
        source_ref="PART 4 / TASKS – Respond to a distress signal at sea",
        pages=(75, 75),
        layout="columns",
        description="PART 4 — RESPONSE TO EMERGENCIES\nTASKS – respond to a distress signal at sea.",
    ),
    dict(
        part=4,
        code="P4-ENGLISH",
        title="Use of IMO Standard Marine Communication Phrases and Use of English",
        source_ref="PART 4 / TASKS – Use of IMO SMCP and use of English",
        pages=(76, 76),
        layout="columns",
        description=(
            "PART 4 — RESPONSE TO EMERGENCIES\n"
            "TASK – Use the IMO Standard Marine Communication Phrases, write and speak English."
        ),
    ),
    dict(
        part=4,
        code="P4-VISUAL",
        title="Transmit and Receive Information by Visual Signalling",
        source_ref="PART 4 / TASKS – Transmit and receive information by visual signalling",
        pages=(77, 77),
        layout="columns",
        description=(
            "PART 4 — RESPONSE TO EMERGENCIES\n"
            "TASKS – transmit and receive information by visual signalling."
        ),
    ),
    dict(
        part=5,
        code="P5-POLLUTION",
        title="Ensure Compliance with Pollution Prevention Requirements",
        source_ref="PART 5 / TASKS – Ensure compliance with pollution prevention requirements",
        pages=(78, 78),
        layout="columns",
        description="PART 5 — ONBOARD SHIP OPERATIONS\nTASKS – Take actions to prevent pollution.",
    ),
    dict(
        part=5,
        code="P5-SEAWORTHY",
        title="Maintain Seaworthiness of the Ship",
        source_ref="PART 5 / TASKS – Maintain seaworthiness of the ship",
        pages=(79, 79),
        layout="columns",
        description=(
            "PART 5 — ONBOARD SHIP OPERATIONS\n"
            "TASKS – Monitor the stability of the ship / maintain seaworthiness."
        ),
    ),
    dict(
        part=5,
        code="P5-LEGISLATION",
        title="Monitor Compliance with Legislative Requirements",
        source_ref="PART 5 / TASKS – Monitor compliance with legislation requirements",
        pages=(80, 80),
        layout="columns",
        description="PART 5 — ONBOARD SHIP OPERATIONS\nTASK – Monitor compliance with legislation.",
    ),
]

WITNESS_SPLIT = re.compile(
    r"Name of Ship\.+\s*(?:Date\.+\s*)?(?:Signature\.+\s*)?",
    re.I,
)

HEADER_NOISE = re.compile(
    r"("
    r"KNOWLEDGE,?\s*UNDERSTANDING\s+and\s*"
    r"|PROFICIENCY\s+REQUIRED\s*"
    r"|CRITERIA\s+FOR\s+(?:SATISFACTORY\s+)?PERFORMANCE\s*"
    r"|SATISFACTORY\s+STANDARD\s+OF\s+PROFICIENCY\s*(?:WITNESSED)?\s*"
    r"|SATISFACTORY\s+COMPLETION\s+OF\s+TASK\s*(?:WITNESSED)?\s*"
    r"|SUPPORT\s+LEVEL\s+FUNCTIONS\)?\s*"
    r"|\)?\s*SUPPORT\s+LEVEL\s+FUNCTIONS\s*"
    r")",
    re.I,
)

DROP_LINE = re.compile(
    r"^(?:"
    r"Name of Candidate.*"
    r"|Rev\s*2\s*\(30/06/04\).*"
    r"|PART\s+\d.*|"
    r"TASKS?\s*[-–:].*"
    r"|Tasks\s*$"
    r"|TASK\s*$"
    r"|NAVIGATION AT.*"
    r"|RESPONSE TO.*"
    r"|ONBOARD SHIP.*"
    r"|YACHT RATING.*"
    r"|FAMILIARISATION.*"
    r"|SHIPBOARD OPERATIONS.*"
    r"|Plan and conduct.*"
    r"|Use radar.*"
    r"|Respond to emergencies.*"
    r"|Ensure compliance.*"
    r"|Monitor compliance.*"
    r"|Maintain seaworthiness.*"
    r"|STCW Competence:.*"
    r"|Use of IMO.*"
    r"|RADAR OBSERVATION.*"
    r"|ARPA:\s*$"
    r"|\(?continued\)?\.?"
    r"|General\s*$"
    r")$",
    re.I,
)

CATEGORY_HEADERS = {
    "steering & helm orders",
    "lookout",
    "mooring",
    "anchoring",
    "ropework",
    "maintenance",
    "safe working practices",
    "watchkeeping",
    "engine room",
}


def load_pages() -> dict[int, str]:
    from pypdf import PdfReader

    reader = PdfReader(str(PDF))
    return {i + 1: (page.extract_text() or "") for i, page in enumerate(reader.pages)}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s).replace("\u00ad", "")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def clean_page(text: str) -> str:
    text = re.sub(r"Name of Candidate\s*_+\s*", "\n", text, flags=re.I)
    text = re.sub(r"Rev\s*2\s*\(30/06/04\)\s*\d+\s*", "\n", text, flags=re.I)
    return text


def strip_noise(text: str) -> str:
    lines = []
    for ln in text.splitlines():
        s = ln.strip()
        if not s:
            lines.append("")
            continue
        if DROP_LINE.match(s):
            continue
        if s.lower() in CATEGORY_HEADERS:
            # keep category as soft prefix on next task via blank line skip
            continue
        lines.append(s)
    text = "\n".join(lines)
    text = HEADER_NOISE.sub(" ", text)
    text = re.sub(r"\s{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip(" \n;:")


def extract_blocks(pages: dict[int, str], page_start: int, page_end: int):
    blocks = []
    for n in range(page_start, page_end + 1):
        cleaned = clean_page(pages.get(n, ""))
        parts = WITNESS_SPLIT.split(cleaned)
        for part in parts[:-1] if len(parts) > 1 else []:
            chunk = part.strip()
            if chunk:
                blocks.append((n, chunk))
    return blocks


def parse_task(chunk: str, layout: str) -> tuple[str, str] | None:
    text = strip_noise(chunk)
    text = norm(text)
    if len(text) < 20:
        return None
    low = text.lower()
    if "training syllabus will include" in low:
        return None
    if low.startswith("proficiency in the operational use of"):
        return None
    if "official stamp" in low or low.startswith("on satisfactory completion"):
        return None

    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    flat = " ".join(re.sub(r"\s*\n\s*", " ", p) for p in paras)
    flat = re.sub(r"\s{2,}", " ", flat).strip()
    flat = HEADER_NOISE.sub(" ", flat)
    flat = re.sub(r"\s{2,}", " ", flat).strip(" :;-()")
    # Drop leftover leading category crumbs from TOC-ish fragments
    flat = re.sub(
        r"^(?:pollution|stability|legislation|manoeuvre|emergencies)\s+",
        "",
        flat,
        flags=re.I,
    ).strip(" :;-()")

    if len(flat) < 20:
        return None

    # Title = first clause / sentence
    m = re.match(r"(.{15,220}?(?:\.|;|!|\?))(?:\s+|$)", flat)
    if m:
        title = m.group(1).strip(" .;:()")
    else:
        # Prefer cut before first bullet
        bullet = flat.find("•")
        if bullet > 20:
            title = flat[:bullet].strip(" .;:()")
        else:
            title = flat[:200].rsplit(" ", 1)[0] if len(flat) > 200 else flat
            title = title.strip(" .;:()")

    title = re.sub(
        r"^(?:PROFICIENCY REQUIRED|KNOWLEDGE.*?REQUIRED)\s+",
        "",
        title,
        flags=re.I,
    ).strip(" .;:()")

    if len(title) < 15:
        return None
    if title.lower().startswith(("knowledge", "criteria", "satisfactory", "proficiency")):
        return None

    description = flat
    if description.lower().startswith(title.lower()):
        rest = description[len(title) :].lstrip(" .;:")
        description = f"{title}\n\n{rest}" if rest else title
    return title, description


def source_hash(code: str, title: str, description: str) -> str:
    return hashlib.sha256(f"{code}|{title}|{description}".encode("utf-8")).hexdigest()


def sql_str(s: str) -> str:
    return "$trb$" + s.replace("$", "") + "$trb$"


def main() -> None:
    if not PDF.exists():
        raise SystemExit(f"Missing PDF: {PDF}")

    pages = load_pages()
    print(f"Loaded {len(pages)} pages from {PDF.name}")

    extracted = []
    for sec in SECTIONS:
        if sec.get("skip_extract"):
            extracted.append(
                {
                    **sec,
                    "tasks": [],
                    "note": "Retained from curated seed sql/seed-trb-mca-oow-pilot-section.sql",
                }
            )
            continue
        tasks = []
        for page_no, chunk in extract_blocks(pages, *sec["pages"]):
            parsed = parse_task(chunk, sec["layout"])
            if not parsed:
                continue
            title, description = parsed
            if any(t["title"].lower() == title.lower() for t in tasks):
                continue
            idx = len(tasks) + 1
            code = f"MCA-{sec['code']}-{idx:02d}"
            tasks.append(
                {
                    "task_code": code,
                    "sort_order": idx,
                    "title": title,
                    "description": description,
                    "source_page_start": page_no,
                    "source_page_end": page_no,
                    "source_task_reference": f"PART {sec['part']} p.{page_no} task {idx}",
                    "source_text_hash": source_hash(code, title, description),
                }
            )
        extracted.append({**sec, "tasks": tasks})

    total = sum(len(s["tasks"]) for s in extracted)
    print(f"Extracted tasks (excl. curated watch): {total}")
    for s in extracted:
        print(f"  {s['code']:16s} p{s['pages'][0]}-{s['pages'][1]}  n={len(s['tasks']):3d}  {s['title'][:48]}")

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(
        json.dumps(
            {
                "source_pdf": "docs/trb/source/training_record_book_revision_22_04-2.pdf",
                "revision": "Rev 2 (30/06/04)",
                "program_code": "SJ-PILOT-MCA-OOW-YACHTS",
                "version": "mca-source-2014-pilot-1",
                "sections": [
                    {
                        "part": s["part"],
                        "code": s["code"],
                        "title": s["title"],
                        "source_ref": s["source_ref"],
                        "pages": list(s["pages"]),
                        "description": s["description"],
                        "task_count": len(s["tasks"]),
                        "tasks": s["tasks"],
                        "note": s.get("note"),
                    }
                    for s in extracted
                ],
                "extracted_task_total": total,
                "curated_watch_tasks": 12,
                "approximate_total_with_watch": total + 12,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n"
    )

    evidence = (
        "SeaJourney guidance only — not MCA text. Upload photos, notes, or other evidence that "
        "supports this task. Continue obtaining required signatures in the official Training Record Book."
    )
    official = (
        "Official TRB: Name of Ship / Date / Signature columns must still be completed in the "
        "paper Training Record Book. Digital sign-off does not replace the official book."
    )

    lines: list[str] = []
    lines += [
        "-- Full-book additive seed: MCA Yacht TRB OOW (Yachts <3,000 GT) digital companion",
        "-- Source: docs/trb/source/training_record_book_revision_22_04-2.pdf · Rev 2 (30/06/04)",
        "-- Programme/version IDs preserved: SJ-PILOT-MCA-OOW-YACHTS / mca-source-2014-pilot-1",
        "-- Idempotent: inserts missing sections/tasks only. Does NOT rewrite curated P3-WATCH tasks.",
        "-- Also backfills trb_task_progress for existing active enrolments on this version.",
        "-- Run AFTER sql/seed-trb-mca-oow-pilot-section.sql",
        "-- Prefer also running sql/promote-trb-oow-yachts-3000gt-companion.sql",
        "",
        "BEGIN;",
        "",
    ]

    sort = 0
    for s in extracted:
        sort += 1
        lines += [
            f"-- Section {sort}: {s['title']}",
            "WITH ver AS (",
            "  SELECT v.id",
            "  FROM public.trb_program_versions v",
            "  JOIN public.trb_programs p ON p.id = v.program_id",
            "  WHERE p.code = 'SJ-PILOT-MCA-OOW-YACHTS' AND v.version = 'mca-source-2014-pilot-1'",
            ")",
            "INSERT INTO public.trb_sections (",
            "  program_version_id, title, description, sort_order,",
            "  source_section_reference, source_page_start, source_page_end",
            ")",
            "SELECT",
            "  ver.id,",
            f"  {sql_str(s['title'])},",
            f"  {sql_str(s['description'])},",
            f"  {sort},",
            f"  {sql_str(s['source_ref'])},",
            f"  {s['pages'][0]},",
            f"  {s['pages'][1]}",
            "FROM ver",
            "WHERE NOT EXISTS (",
            "  SELECT 1 FROM public.trb_sections x",
            "  WHERE x.program_version_id = ver.id",
            f"    AND x.title = {sql_str(s['title'])}",
            ");",
            "",
            "UPDATE public.trb_sections s",
            f"SET sort_order = {sort},",
            f"    description = COALESCE(s.description, {sql_str(s['description'])}),",
            f"    source_section_reference = COALESCE(s.source_section_reference, {sql_str(s['source_ref'])}),",
            f"    source_page_start = COALESCE(s.source_page_start, {s['pages'][0]}),",
            f"    source_page_end = COALESCE(s.source_page_end, {s['pages'][1]})",
            "FROM public.trb_program_versions v",
            "JOIN public.trb_programs p ON p.id = v.program_id",
            "WHERE s.program_version_id = v.id",
            "  AND p.code = 'SJ-PILOT-MCA-OOW-YACHTS'",
            "  AND v.version = 'mca-source-2014-pilot-1'",
            f"  AND s.title = {sql_str(s['title'])};",
            "",
        ]

        if not s["tasks"]:
            continue

        value_rows = []
        for t in s["tasks"]:
            value_rows.append(
                "  ("
                f"{sql_str(t['task_code'])}, {t['sort_order']}, {t['source_page_start']}, {t['source_page_end']}, "
                f"{sql_str(t['source_task_reference'])}, {sql_str(t['title'])}, {sql_str(t['description'])}, "
                f"{sql_str(t['source_text_hash'])}"
                ")"
            )

        lines += [
            "WITH sec AS (",
            "  SELECT s.id",
            "  FROM public.trb_sections s",
            "  JOIN public.trb_program_versions v ON v.id = s.program_version_id",
            "  JOIN public.trb_programs p ON p.id = v.program_id",
            "  WHERE p.code = 'SJ-PILOT-MCA-OOW-YACHTS'",
            "    AND v.version = 'mca-source-2014-pilot-1'",
            f"    AND s.title = {sql_str(s['title'])}",
            ")",
            "INSERT INTO public.trb_tasks (",
            "  section_id, task_code, title, description, evidence_guidance, seajourney_guidance,",
            "  required_signer_role, sort_order, is_required,",
            "  source_task_reference, source_page_start, source_page_end, source_text_hash,",
            "  official_signer_instruction",
            ")",
            "SELECT sec.id, t.task_code, t.title, t.description,",
            f"  {sql_str(evidence)},",
            f"  {sql_str(evidence)},",
            "  'captain', t.sort_order, true,",
            "  t.source_ref, t.page_start, t.page_end, t.source_hash,",
            f"  {sql_str(official)}",
            "FROM sec",
            "CROSS JOIN (VALUES",
            ",\n".join(value_rows),
            ") AS t(task_code, sort_order, page_start, page_end, source_ref, title, description, source_hash)",
            "WHERE NOT EXISTS (",
            "  SELECT 1 FROM public.trb_tasks x",
            "  WHERE x.section_id = sec.id AND x.task_code = t.task_code",
            ");",
            "",
        ]

    lines += [
        "-- Backfill progress rows for existing active enrolments on this version",
        "INSERT INTO public.trb_task_progress (enrollment_id, task_id, status)",
        "SELECT e.id, t.id, 'not_started'",
        "FROM public.trb_enrollments e",
        "JOIN public.trb_program_versions v ON v.id = e.program_version_id",
        "JOIN public.trb_programs p ON p.id = v.program_id",
        "JOIN public.trb_sections s ON s.program_version_id = v.id",
        "JOIN public.trb_tasks t ON t.section_id = s.id",
        "WHERE p.code = 'SJ-PILOT-MCA-OOW-YACHTS'",
        "  AND v.version = 'mca-source-2014-pilot-1'",
        "  AND e.status = 'active'",
        "  AND NOT EXISTS (",
        "    SELECT 1 FROM public.trb_task_progress tp",
        "    WHERE tp.enrollment_id = e.id AND tp.task_id = t.id",
        "  );",
        "",
        "UPDATE public.trb_programs",
        "SET",
        "  name = 'OOW (Yachts <3,000 GT) Training Record',",
        "  description =",
        "    'A digital training-record companion based on the MCA-published OOW (Yachts <3,000 GT) Training Record Book (Parts 1–5 task sections). SeaJourney provides a digital companion only — not MCA or PYA approved as a replacement for the official paper book.',",
        "  updated_at = now()",
        "WHERE code = 'SJ-PILOT-MCA-OOW-YACHTS';",
        "",
        "UPDATE public.trb_program_versions v",
        "SET",
        "  content_provenance =",
        "    'Task wording imported from the official MCA Yacht Training Record Book PDF (Rev 2). Signable task sections from Parts 1–5 are published in SeaJourney (personal-details / service / testimonial / spare forms excluded). PART 3 Maintain a Safe Navigational Watch retains the curated pilot seed wording.',",
        "  source_checked_at = CURRENT_DATE",
        "FROM public.trb_programs p",
        "WHERE v.program_id = p.id",
        "  AND p.code = 'SJ-PILOT-MCA-OOW-YACHTS'",
        "  AND v.version = 'mca-source-2014-pilot-1';",
        "",
        "COMMIT;",
        "",
    ]
    OUT_SQL.write_text("\n".join(lines))

    md = [
        "# OOW (Yachts <3,000 GT) — full-book task manifest",
        "",
        "**Source PDF:** `docs/trb/source/training_record_book_revision_22_04-2.pdf` · Rev 2 (30/06/04)",
        "**Seed:** `sql/seed-trb-oow-yachts-3000gt-full-book.sql`",
        "**Machine extract:** `docs/trb/extracted/oow-yachts-3000gt-tasks.json`",
        "**Extractor:** `scripts/trb/extract_oow_trb_full_book.py`",
        "",
        "Personal details, guidance, service records, testimonials, familiarisation checklists (book sections 1–11), and spare forms are **not** imported as signable tasks.",
        "",
        f"Extracted new tasks (excluding curated watch section): **{total}**",
        "Curated watch section (`Maintain a Safe Navigational Watch`): **12** tasks from prior seed.",
        f"Approximate published total after seed: **{total + 12}**",
        "",
        "| Part | Section | Pages | Tasks |",
        "| --- | --- | --- | ---: |",
    ]
    for s in extracted:
        n = 12 if s["code"] == "P3-WATCH" else len(s["tasks"])
        md.append(
            f"| {s['part']} | {s['title']} | {s['pages'][0]}–{s['pages'][1]} | {n} |"
        )
    md += [
        "",
        "## Notes",
        "",
        "1. PDF text extraction flattens multi-column Knowledge/Criteria layouts; wording is taken from the official PDF via `pypdf`.",
        "2. Hyphenation and column-reflow artifacts may remain in longer descriptions.",
        "3. Page 58 (radar syllabus prerequisites) has no signable witness rows — stored in section description only.",
        "4. Firefighting tasks on page 72 are filed under contents title *Prevent, Control and Fight Fires on Board*.",
        "5. Existing active enrolments receive new `trb_task_progress` rows via the seed backfill.",
        "",
    ]
    OUT_MD.write_text("\n".join(md))
    print(f"Wrote {OUT_JSON}")
    print(f"Wrote {OUT_SQL} ({OUT_SQL.stat().st_size} bytes)")
    print(f"Wrote {OUT_MD}")


if __name__ == "__main__":
    main()
