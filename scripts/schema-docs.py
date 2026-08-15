#!/usr/bin/env python3
"""
Generate database documentation as a PDF, parsed from prisma/schema.prisma.

Derived from the schema rather than transcribed, so it cannot drift: re-run it
after any schema change and the document is current. Doc comments in the schema
are carried through, which is where the "why" of a column usually lives.

    python3 scripts/schema-docs.py [--out docs/database.pdf]
"""

import argparse
import re
import subprocess
from dataclasses import dataclass, field as dc_field
from datetime import datetime, timezone, timedelta
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parent.parent
SCHEMA = ROOT / "prisma" / "schema.prisma"

INK = colors.HexColor("#0f172a")
MUTED = colors.HexColor("#64748b")
RULE = colors.HexColor("#e2e8f0")
ACCENT = colors.HexColor("#0369a1")
BAND = colors.HexColor("#f8fafc")
WARN = colors.HexColor("#b45309")
WARN_BG = colors.HexColor("#fffbeb")


# ---------------------------------------------------------------- parsing


@dataclass
class Field:
    name: str
    type: str
    attrs: str
    doc: str = ""
    # Set after parsing, once every model name is known.
    relation: bool = False

    @property
    def optional(self) -> bool:
        return self.type.endswith("?")

    @property
    def is_list(self) -> bool:
        return self.type.endswith("[]")

    @property
    def is_relation(self) -> bool:
        return self.relation

    @property
    def base_type(self) -> str:
        return self.type.rstrip("?").removesuffix("[]")


@dataclass
class Model:
    name: str
    section: str
    doc: str = ""
    fields: list = dc_field(default_factory=list)
    block_attrs: list = dc_field(default_factory=list)

    @property
    def scalars(self):
        return [f for f in self.fields if not f.is_relation]

    @property
    def relations(self):
        return [f for f in self.fields if f.is_relation]


@dataclass
class Enum:
    name: str
    section: str
    doc: str = ""
    values: list = dc_field(default_factory=list)  # (value, comment)


def parse_schema(text: str):
    models, enums = [], []
    section = "General"
    pending_doc: list[str] = []
    lines = text.splitlines()
    i = 0

    while i < len(lines):
        raw = lines[i]
        stripped = raw.strip()

        banner = re.match(r"^//\s*=+\s*(.*?)\s*=+\s*$", stripped)
        if banner:
            section = banner.group(1).title()
            pending_doc = []
            i += 1
            continue

        if stripped.startswith("//"):
            pending_doc.append(stripped.lstrip("/").strip())
            i += 1
            continue

        m = re.match(r"^model\s+(\w+)\s*\{", stripped)
        if m:
            model = Model(name=m.group(1), section=section, doc=" ".join(pending_doc))
            pending_doc = []
            i += 1
            fdoc: list[str] = []
            while i < len(lines) and lines[i].strip() != "}":
                fl = lines[i].strip()
                if fl.startswith("//"):
                    fdoc.append(fl.lstrip("/").strip())
                    i += 1
                    continue
                if fl.startswith("@@"):
                    model.block_attrs.append(fl)
                    fdoc = []
                    i += 1
                    continue
                if fl:
                    inline = ""
                    if "//" in fl:
                        code, inline = fl.split("//", 1)
                        fl, inline = code.strip(), inline.strip()
                    parts = fl.split(None, 2)
                    if len(parts) >= 2:
                        doc = " ".join(fdoc)
                        if inline:
                            doc = f"{doc} {inline}".strip()
                        model.fields.append(
                            Field(parts[0], parts[1], parts[2] if len(parts) > 2 else "", doc)
                        )
                    fdoc = []
                i += 1
            models.append(model)
            i += 1
            continue

        m = re.match(r"^enum\s+(\w+)\s*\{", stripped)
        if m:
            en = Enum(name=m.group(1), section=section, doc=" ".join(pending_doc))
            pending_doc = []
            i += 1
            vdoc: list[str] = []
            while i < len(lines) and lines[i].strip() != "}":
                vl = lines[i].strip()
                if vl.startswith("//"):
                    vdoc.append(vl.lstrip("/").strip())
                elif vl:
                    en.values.append((vl, " ".join(vdoc)))
                    vdoc = []
                i += 1
            enums.append(en)
            i += 1
            continue

        if stripped:
            pending_doc = []
        i += 1

    # A field is a relation if it points at another model — either the owning
    # side (which carries @relation and a real FK column) or the inverse list
    # side, which has no attributes at all and is not a column in the database.
    # Classifying on @relation alone would list `legs Leg[]` as a column.
    model_names = {m.name for m in models}
    for m in models:
        for f in m.fields:
            f.relation = f.base_type in model_names

    return models, enums


# ---------------------------------------------------------------- helpers


def esc(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def balanced(s: str, start: int) -> str:
    """Text inside the parens beginning at `start`, respecting nesting.

    `@default(cuid())` needs this — a non-greedy `[^)]*` stops at the inner
    paren and reports the default as `cuid(`.
    """
    depth, out = 0, []
    for ch in s[start:]:
        if ch == "(":
            depth += 1
            if depth == 1:
                continue
        elif ch == ")":
            depth -= 1
            if depth == 0:
                break
        out.append(ch)
    return "".join(out)


def attr_summary(f: Field) -> str:
    """Condense Prisma attributes into something a reader can scan."""
    bits = []
    a = f.attrs
    if "@id" in a:
        bits.append("PK")
    if "@unique" in a:
        bits.append("unique")
    at = a.find("@default(")
    if at != -1:
        bits.append(f"default {balanced(a, at + len('@default'))}")
    db = re.search(r"@db\.(\w+\([^)]*\)|\w+)", a)
    if db:
        bits.append(db.group(1))
    if "@updatedAt" in a:
        bits.append("auto-updated")
    r = re.search(r"onDelete:\s*(\w+)", a)
    if r:
        bits.append(f"onDelete {r.group(1)}")
    return ", ".join(bits)


def git_meta():
    def run(*args):
        try:
            return subprocess.run(
                args, cwd=ROOT, capture_output=True, text=True, timeout=10
            ).stdout.strip()
        except Exception:
            return ""

    return run("git", "rev-parse", "--short", "HEAD"), run(
        "git", "rev-parse", "--abbrev-ref", "HEAD"
    )


# ---------------------------------------------------------------- styles

ss = getSampleStyleSheet()
S = {
    "title": ParagraphStyle("t", parent=ss["Title"], fontSize=30, leading=34,
                            textColor=INK, spaceAfter=4),
    "subtitle": ParagraphStyle("st", parent=ss["Normal"], fontSize=12.5, leading=18,
                               textColor=MUTED, spaceAfter=2),
    "h1": ParagraphStyle("h1", parent=ss["Heading1"], fontSize=17, leading=21,
                         textColor=ACCENT, spaceBefore=2, spaceAfter=8),
    "h2": ParagraphStyle("h2", parent=ss["Heading2"], fontSize=12.5, leading=15,
                         textColor=INK, spaceBefore=12, spaceAfter=4),
    "body": ParagraphStyle("b", parent=ss["Normal"], fontSize=9.6, leading=13.8,
                           textColor=INK, alignment=TA_LEFT, spaceAfter=6),
    "note": ParagraphStyle("n", parent=ss["Normal"], fontSize=9, leading=13,
                           textColor=MUTED, spaceAfter=6),
    "cell": ParagraphStyle("c", parent=ss["Normal"], fontSize=8, leading=10.4,
                           textColor=INK),
    "cellmuted": ParagraphStyle("cm", parent=ss["Normal"], fontSize=7.6, leading=10.2,
                                textColor=MUTED),
    "mono": ParagraphStyle("m", parent=ss["Normal"], fontName="Courier",
                           fontSize=8, leading=10.4, textColor=INK),
    "warn": ParagraphStyle("w", parent=ss["Normal"], fontSize=9, leading=13,
                           textColor=WARN),
}


def para(t, s="body"):
    return Paragraph(t, S[s])


def callout(title: str, body: str):
    """A bordered aside for the traps that cost real money if missed."""
    inner = [
        [Paragraph(f"<b>{esc(title)}</b>", S["warn"])],
        [Paragraph(esc(body), S["note"])],
    ]
    t = Table(inner, colWidths=[168 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), WARN_BG),
        ("BOX", (0, 0), (-1, -1), 0.6, WARN),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return t


def field_table(model: Model):
    head = ["Column", "Type", "Constraints", "Notes"]
    rows = [[Paragraph(f"<b>{h}</b>", S["cell"]) for h in head]]
    for f in model.scalars:
        opt = "" if f.optional else " <font color='#b45309'>*</font>"
        rows.append([
            Paragraph(f"<font face='Courier'>{esc(f.name)}</font>{opt}", S["cell"]),
            Paragraph(f"<font face='Courier'>{esc(f.type)}</font>", S["cellmuted"]),
            Paragraph(esc(attr_summary(f)), S["cellmuted"]),
            Paragraph(esc(f.doc), S["cellmuted"]),
        ])
    t = Table(rows, colWidths=[40 * mm, 26 * mm, 38 * mm, 64 * mm], repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), BAND),
        ("LINEBELOW", (0, 0), (-1, 0), 0.7, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
    ]
    for r in range(1, len(rows)):
        style.append(("LINEBELOW", (0, r), (-1, r), 0.25, RULE))
    t.setStyle(TableStyle(style))
    return t


def relation_table(model: Model):
    head = ("Relation", "Target", "Cardinality", "Foreign key", "On delete")
    rows = [[Paragraph(f"<b>{h}</b>", S["cell"]) for h in head]]
    for f in model.relations:
        od = re.search(r"onDelete:\s*(\w+)", f.attrs)
        fk = re.search(r"fields:\s*\[([^\]]*)\]", f.attrs)
        if f.is_list:
            card = "has many"
        elif f.optional:
            card = "has one (optional)"
        else:
            card = "has one"
        rows.append([
            Paragraph(f"<font face='Courier'>{esc(f.name)}</font>", S["cell"]),
            Paragraph(f"<font face='Courier'>{esc(f.base_type)}</font>", S["cellmuted"]),
            Paragraph(card, S["cellmuted"]),
            Paragraph(
                f"<font face='Courier'>{esc(fk.group(1))}</font>" if fk
                else "<font color='#94a3b8'>inverse side</font>",
                S["cellmuted"],
            ),
            Paragraph(esc(od.group(1)) if od else "—", S["cellmuted"]),
        ])
    t = Table(rows, colWidths=[34 * mm, 44 * mm, 28 * mm, 36 * mm, 26 * mm], repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), BAND),
        ("LINEBELOW", (0, 0), (-1, 0), 0.7, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
    ]
    for r in range(1, len(rows)):
        style.append(("LINEBELOW", (0, r), (-1, r), 0.25, RULE))
    t.setStyle(TableStyle(style))
    return t


# ---------------------------------------------------------------- document


class Doc(BaseDocTemplate):
    def __init__(self, path, **kw):
        super().__init__(path, pagesize=A4,
                         leftMargin=21 * mm, rightMargin=21 * mm,
                         topMargin=20 * mm, bottomMargin=18 * mm, **kw)
        frame = Frame(self.leftMargin, self.bottomMargin,
                      self.width, self.height, id="f")
        self.addPageTemplates([
            PageTemplate(id="cover", frames=[frame]),
            PageTemplate(id="body", frames=[frame], onPage=self._chrome),
        ])
        self.toc_entries = []

    def _chrome(self, canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(21 * mm, 11 * mm, "Gilifast — Database Reference")
        canvas.drawRightString(A4[0] - 21 * mm, 11 * mm, str(doc.page))
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(0.4)
        canvas.line(21 * mm, 14 * mm, A4[0] - 21 * mm, 14 * mm)
        canvas.restoreState()

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name == "h1":
            self.toc_entries.append((flowable.getPlainText(), self.page))


def build(models, enums, out_path: Path):
    sha, branch = git_meta()
    wita = datetime.now(timezone(timedelta(hours=8)))
    story = []

    # ---- cover
    story += [
        Spacer(1, 52 * mm),
        para("Gilifast", "title"),
        para("Database Reference", "subtitle"),
        Spacer(1, 8 * mm),
        para(
            f"PostgreSQL via Prisma · {len(models)} tables · {len(enums)} enums<br/>"
            f"Generated from <font face='Courier'>prisma/schema.prisma</font> "
            f"on {wita:%d %B %Y} (WITA)",
            "note",
        ),
        para(
            f"Commit <font face='Courier'>{esc(sha or 'unknown')}</font> · "
            f"branch <font face='Courier'>{esc(branch or 'unknown')}</font>",
            "note",
        ),
        Spacer(1, 10 * mm),
        callout(
            "This document is generated, not written",
            "Re-run scripts/schema-docs.py after any schema change. Editing this "
            "PDF by hand guarantees it disagrees with the database on the next "
            "migration.",
        ),
        NextPageTemplate("body"),
        PageBreak(),
    ]

    # ---- how to read / conventions
    story += [
        para("Reading this document", "h1"),
        para(
            "Every table below is generated directly from the Prisma schema. A "
            "<font color='#b45309'>*</font> after a column name means it is "
            "required (Prisma <font face='Courier'>NOT NULL</font>); everything "
            "else is nullable. The Notes column carries the schema's own comments, "
            "which is where the reasoning behind a column usually lives.",
        ),
        para(
            "Table names are quoted PascalCase in Postgres. Prisma does not remap "
            "them, so raw SQL needs double quotes: "
            "<font face='Courier'>SELECT * FROM \"Booking\"</font>, not "
            "<font face='Courier'>FROM booking</font>.",
        ),
        para("Conventions that apply across the schema", "h2"),
        para(
            "<b>Identifiers.</b> Every table uses a "
            "<font face='Courier'>cuid()</font> string primary key, not a "
            "sequence. IDs are therefore safe to generate client-side and carry no "
            "ordering information — never sort by <font face='Courier'>id</font> "
            "expecting chronology; use <font face='Courier'>createdAt</font>.",
        ),
        para(
            "<b>Money.</b> All amounts are "
            "<font face='Courier'>Decimal</font>, never float, and all are IDR "
            "unless a sibling currency column says otherwise. The application "
            "carries <font face='Courier'>Prisma.Decimal</font> end to end to "
            "avoid rounding drift; see <font face='Courier'>lib/pricing.ts</font>.",
        ),
        para(
            "<b>Time.</b> Timestamps are stored UTC. Every customer-facing time is "
            "rendered in WITA (Asia/Makassar) through "
            "<font face='Courier'>lib/datetime.ts</font>. A raw timestamp read out "
            "of the database is eight hours behind what the passenger was told.",
        ),
        para(
            "<b>Soft deletes.</b> <font face='Courier'>Operator</font>, "
            "<font face='Courier'>Boat</font>, <font face='Courier'>Schedule</font>, "
            "<font face='Courier'>Port</font>, <font face='Courier'>OperatorStaff</font> "
            "and <font face='Courier'>TravelAgent</font> carry "
            "<font face='Courier'>deletedAt</font>. Every list query must filter "
            "<font face='Courier'>deletedAt: null</font> — a query that forgets it "
            "silently resurrects retired boats into search results.",
        ),
        para(
            "<b>Tenant scoping.</b> Operator-facing queries are scoped by "
            "<font face='Courier'>operatorId</font>; logged-in customer queries by "
            "<font face='Courier'>customerId</font>. Admin queries are unscoped on "
            "purpose. There is no row-level security in the database — scoping is "
            "enforced entirely in application code, so an unscoped query is a "
            "cross-tenant data leak, not just a bug.",
        ),
        Spacer(1, 2 * mm),
        callout(
            "Foreign keys into the catalogue are onDelete: Restrict",
            "Deleting a row means walking its subtree bottom-up by hand. This is "
            "deliberate: it makes it impossible to erase a boat and take a year of "
            "bookings with it. lib/operator-purge.ts is the only code that does "
            "this, and it refuses whenever the subtree contains a Payment, Refund "
            "or Ticket — no row in the financial chain is ever destroyed.",
        ),
        PageBreak(),
    ]

    # ---- design notes that are not visible in the column list
    story += [
        para("Three behaviours the column list does not show", "h1"),
        para(
            "These are the parts of the data model most likely to surprise someone "
            "editing the database directly.",
        ),
        para("1 · Schedule is a template; Leg is a frozen sale price", "h2"),
        para(
            "<font face='Courier'>Schedule.basePrice</font> is the pricing policy "
            "for a route. When a concrete departure is generated, "
            "<font face='Courier'>lib/legs.ts</font> <i>copies</i> that value into "
            "the new <font face='Courier'>Leg.basePrice</font>. From then on the two "
            "are independent numbers, and booking reads only the leg "
            "(<font face='Courier'>lib/booking-engine.ts</font>).",
        ),
        para(
            "The freeze is deliberate: it keeps the price stable for departures "
            "already on sale, and it is what makes a historical booking auditable. "
            "The yield multiplier still reads live from "
            "<font face='Courier'>Schedule.pricingTiers</font>, because two "
            "departures of the same schedule can be at very different occupancy.",
        ),
        callout(
            "Changing a price means updating both tables",
            "Updating Schedule.basePrice alone changes nothing customers can see — "
            "the nightly topup-legs cron only adds new dates, never rewrites "
            "existing legs, so the old price keeps selling for up to the full "
            "60-day horizon. Updating Leg alone reprices what is on sale, but the "
            "next cron run generates tomorrow's departure at the old price again.",
        ),
        para("2 · Payment settling does not issue a ticket", "h2"),
        para(
            "Money arriving moves a booking to "
            "<font face='Courier'>AWAITING_CONFIRMATION</font> and mints no "
            "<font face='Courier'>Ticket</font> rows. Operators on this platform "
            "take bookings by phone and do not use the dashboard, so an admin "
            "confirms the boat is running before any boarding pass exists. Tickets "
            "are created on the far side of that call, by "
            "<font face='Courier'>issueTicketsForBooking</font> in "
            "<font face='Courier'>lib/ticket-issuer.ts</font>.",
        ),
        para(
            "Seats stay held on the <font face='Courier'>Leg</font> for the whole "
            "waiting window, and expiry only sweeps "
            "<font face='Courier'>PENDING_PAYMENT</font>, so a paid booking cannot "
            "have its seats reclaimed underneath it.",
        ),
        para("3 · Two enums carry values the application no longer writes", "h2"),
        para(
            "<font face='Courier'>SalesChannel.GILIJET</font> is the pre-rename "
            "value for <font face='Courier'>GILIFAST</font>, and "
            "<font face='Courier'>PaymentProvider</font> retains "
            "<font face='Courier'>XENDIT</font>, <font face='Courier'>MAYAR</font> "
            "and <font face='Courier'>STRIPE</font>. They are kept because existing "
            "rows reference them, and dropping an in-use enum value makes "
            "<font face='Courier'>prisma db push</font> refuse the entire push. "
            "<font face='Courier'>lib/sales-channel.ts</font> folds the legacy "
            "channel onto the current one for every report and display; anything "
            "asking \"was this sold on our own platform?\" must match both.",
        ),
        Spacer(1, 2 * mm),
        para(
            "<b>No migration history.</b> There is no "
            "<font face='Courier'>prisma/migrations/</font> directory. Schema "
            "reaches the database through "
            "<font face='Courier'>prisma db push</font> during the build, run by "
            "<font face='Courier'>scripts/db-push-if-configured.mjs</font>, never "
            "with <font face='Courier'>--accept-data-loss</font>. A destructive "
            "change fails the build rather than executing — including any table "
            "created by hand in the SQL editor that the schema does not know about.",
            "note",
        ),
        PageBreak(),
    ]

    # ---- tables, grouped by the schema's own sections
    order, seen = [], set()
    for m in models:
        if m.section not in seen:
            seen.add(m.section)
            order.append(m.section)

    story.append(para("Tables", "h1"))
    story.append(para(
        f"{len(models)} tables, grouped as the schema groups them.", "note"))

    for sec in order:
        group = [m for m in models if m.section == sec]
        if not group:
            continue
        story.append(Spacer(1, 4 * mm))
        story.append(para(esc(sec), "h2"))
        for m in group:
            block = [
                Paragraph(
                    f"<b><font face='Courier' size='11'>{esc(m.name)}</font></b>",
                    S["h2"],
                )
            ]
            if m.doc:
                block.append(para(esc(m.doc), "note"))
            block.append(field_table(m))
            if m.relations:
                block.append(Spacer(1, 2 * mm))
                block.append(para("<b>Relations</b>", "note"))
                block.append(relation_table(m))
            idx = [a for a in m.block_attrs if a.startswith("@@index") or a.startswith("@@unique")]
            if idx:
                block.append(Spacer(1, 1.5 * mm))
                block.append(Paragraph(
                    "<b>Indexes:</b> " + esc("  ".join(idx)), S["cellmuted"]))
            block.append(Spacer(1, 6 * mm))
            # Keep small tables whole; let big ones flow across a page break
            # rather than leaving half a page blank ahead of them.
            if len(m.fields) <= 12:
                story.append(KeepTogether(block))
            else:
                story.extend(block)

    # ---- enums
    story.append(PageBreak())
    story.append(para("Enumerated types", "h1"))
    story.append(para(
        f"{len(enums)} enums. Values are stored as Postgres enum types, so adding "
        "one is additive and safe, while removing one that existing rows reference "
        "will fail the whole schema push.", "note"))

    rows = [[Paragraph(f"<b>{h}</b>", S["cell"]) for h in ("Type", "Values")]]
    for e in enums:
        vals = ", ".join(v for v, _ in e.values)
        notes = [f"{v} — {c}" for v, c in e.values if c]
        cell = f"<font face='Courier'>{esc(vals)}</font>"
        if e.doc:
            cell += f"<br/><font color='#64748b'>{esc(e.doc)}</font>"
        for n in notes:
            cell += f"<br/><font color='#64748b'>{esc(n)}</font>"
        rows.append([
            Paragraph(f"<font face='Courier'><b>{esc(e.name)}</b></font>", S["cell"]),
            Paragraph(cell, S["cellmuted"]),
        ])
    t = Table(rows, colWidths=[44 * mm, 124 * mm], repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), BAND),
        ("LINEBELOW", (0, 0), (-1, 0), 0.7, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
    ]
    for r in range(1, len(rows)):
        style.append(("LINEBELOW", (0, r), (-1, r), 0.25, RULE))
    t.setStyle(TableStyle(style))
    story.append(t)

    Doc(str(out_path)).build(story)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "docs" / "database.pdf"))
    args = ap.parse_args()

    models, enums = parse_schema(SCHEMA.read_text())
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    build(models, enums, out)

    fields = sum(len(m.fields) for m in models)
    print(f"[schema-docs] {len(models)} tables, {fields} columns, {len(enums)} enums")
    print(f"[schema-docs] wrote {out} ({out.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
