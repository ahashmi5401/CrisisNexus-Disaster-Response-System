from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY, TA_RIGHT
from reportlab.platypus.flowables import Flowable
from reportlab.pdfgen import canvas as rl_canvas
from pypdf import PdfWriter, PdfReader
from io import BytesIO

# ── Palette (white theme, professional) ─────────────────────────────────────
WHITE      = colors.white
BLACK      = colors.HexColor("#111111")
DARK_GRAY  = colors.HexColor("#2C2C2C")
MID_GRAY   = colors.HexColor("#555555")
LIGHT_GRAY = colors.HexColor("#F5F6F8")
RULE_GRAY  = colors.HexColor("#DDDDDD")
STEEL_BLUE = colors.HexColor("#1A5276")   # primary accent
LIGHT_BLUE = colors.HexColor("#2E86C1")   # secondary accent
PALE_BLUE  = colors.HexColor("#EBF5FB")   # table header / light fill
PALE_GRAY2 = colors.HexColor("#FAFAFA")   # alternating rows
ACCENT_RED = colors.HexColor("#C0392B")   # severity / warning only
ACCENT_GRN = colors.HexColor("#1E8449")   # positive / confirmed
MID_BLUE   = colors.HexColor("#5DADE2")   # chart mid colour

W, H = A4

# ── Style Sheet ──────────────────────────────────────────────────────────────
base = getSampleStyleSheet()

def S(name, parent='Normal', **kw):
    return ParagraphStyle(name, parent=base[parent], **kw)

COVER_TITLE  = S('CT', fontSize=30, textColor=WHITE, fontName='Helvetica-Bold', alignment=TA_LEFT, leading=36)
COVER_SUB    = S('CS', fontSize=13, textColor=colors.HexColor("#BDC3C7"), fontName='Helvetica', alignment=TA_LEFT, leading=18)
COVER_LABEL  = S('CL', fontSize=9,  textColor=colors.HexColor("#85929E"), fontName='Helvetica', alignment=TA_LEFT)

DOC_TITLE    = S('DT', fontSize=22, textColor=STEEL_BLUE, fontName='Helvetica-Bold', spaceBefore=0, spaceAfter=4, alignment=TA_LEFT)
H1           = S('H1', fontSize=14, textColor=STEEL_BLUE, fontName='Helvetica-Bold', spaceBefore=16, spaceAfter=4)
H2           = S('H2', fontSize=11, textColor=DARK_GRAY,  fontName='Helvetica-Bold', spaceBefore=10, spaceAfter=3)
H3           = S('H3', fontSize=10, textColor=LIGHT_BLUE, fontName='Helvetica-Bold', spaceBefore=6,  spaceAfter=2)
BODY         = S('BD', fontSize=9.5, textColor=DARK_GRAY, leading=14, alignment=TA_JUSTIFY, spaceAfter=5)
BODY_L       = S('BL', fontSize=9.5, textColor=DARK_GRAY, leading=14, alignment=TA_LEFT, spaceAfter=3)
BULLET       = S('BU', fontSize=9.5, textColor=DARK_GRAY, leading=14, leftIndent=14, spaceAfter=2, bulletIndent=4)
MONO         = S('MN', fontName='Courier', fontSize=8.5, textColor=DARK_GRAY, leading=13)
TBL_HDR      = S('TH', fontSize=9,  textColor=WHITE,      fontName='Helvetica-Bold', alignment=TA_LEFT)
TBL_CELL     = S('TC', fontSize=9,  textColor=DARK_GRAY,  leading=13)
TBL_CELL_C   = S('TCC',fontSize=9,  textColor=DARK_GRAY,  leading=13, alignment=TA_CENTER)
FOOTER_S     = S('FT', fontSize=7.5,textColor=colors.HexColor("#999999"), alignment=TA_CENTER)
CAPTION      = S('CA', fontSize=8,  textColor=MID_GRAY,   alignment=TA_CENTER, fontName='Helvetica-Oblique')
STEP_LABEL   = S('SL', fontSize=8,  textColor=LIGHT_BLUE, fontName='Helvetica-Bold', spaceAfter=1)
NOTE         = S('NT', fontSize=8.5,textColor=MID_GRAY,   fontName='Helvetica-Oblique', leading=13, alignment=TA_JUSTIFY)

# ── Custom Flowables ─────────────────────────────────────────────────────────

class SectionHeader(Flowable):
    """Full-width section header bar."""
    def __init__(self, number, title, width):
        Flowable.__init__(self)
        self.number = number; self.title = title
        self.width = width; self.height = 28
    def draw(self):
        c = self.canv
        # Background bar
        c.setFillColor(STEEL_BLUE)
        c.roundRect(0, 0, self.width, self.height, 3, fill=1, stroke=0)
        # Number badge
        c.setFillColor(LIGHT_BLUE)
        c.roundRect(6, 4, 26, 20, 2, fill=1, stroke=0)
        c.setFont('Helvetica-Bold', 8); c.setFillColor(WHITE)
        c.drawCentredString(19, 10, str(self.number))
        # Title
        c.setFont('Helvetica-Bold', 11); c.setFillColor(WHITE)
        c.drawString(40, 9, self.title)

class StepBar(Flowable):
    """Step indicator bar."""
    def __init__(self, num, title, time_label, width):
        Flowable.__init__(self)
        self.num = num; self.title = title
        self.time_label = time_label; self.width = width; self.height = 24
    def draw(self):
        c = self.canv
        c.setFillColor(PALE_BLUE)
        c.roundRect(0, 0, self.width, self.height, 3, fill=1, stroke=0)
        c.setStrokeColor(LIGHT_BLUE); c.setLineWidth(0.5)
        c.roundRect(0, 0, self.width, self.height, 3, fill=0, stroke=1)
        # Step number
        c.setFillColor(STEEL_BLUE)
        c.roundRect(6, 4, 38, 16, 2, fill=1, stroke=0)
        c.setFont('Helvetica-Bold', 7.5); c.setFillColor(WHITE)
        c.drawCentredString(25, 9, f"STEP {self.num}")
        # Title
        c.setFont('Helvetica-Bold', 9.5); c.setFillColor(DARK_GRAY)
        c.drawString(52, 9, self.title)
        # Time
        if self.time_label:
            c.setFont('Helvetica', 8); c.setFillColor(LIGHT_BLUE)
            c.drawRightString(self.width - 8, 9, self.time_label)

class HRule(Flowable):
    def __init__(self, width, color=RULE_GRAY, thickness=0.5):
        Flowable.__init__(self)
        self.width = width; self.color = color
        self.thickness = thickness; self.height = 1
    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.thickness)
        self.canv.line(0, 0, self.width, 0)

# ── Helper builders ──────────────────────────────────────────────────────────

def tbl(data, col_widths, hdr_color=STEEL_BLUE, stripe=True):
    t = Table(data, colWidths=col_widths)
    style = [
        ('BACKGROUND',  (0,0), (-1,0),  hdr_color),
        ('TEXTCOLOR',   (0,0), (-1,0),  WHITE),
        ('FONTNAME',    (0,0), (-1,0),  'Helvetica-Bold'),
        ('FONTSIZE',    (0,0), (-1,0),  9),
        ('TOPPADDING',  (0,0), (-1,-1), 5),
        ('BOTTOMPADDING',(0,0),(-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING',(0,0), (-1,-1), 8),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[WHITE, PALE_GRAY2] if stripe else [WHITE]),
        ('GRID',        (0,0), (-1,-1), 0.4, RULE_GRAY),
        ('VALIGN',      (0,0), (-1,-1), 'MIDDLE'),
    ]
    t.setStyle(TableStyle(style))
    return t

def info_box(lines, accent=LIGHT_BLUE, bg=PALE_BLUE):
    rows = [[Paragraph(l, MONO)] for l in lines]
    t = Table(rows, colWidths=[None])
    t.setStyle(TableStyle([
        ('BACKGROUND',   (0,0),(-1,-1), bg),
        ('LEFTPADDING',  (0,0),(-1,-1), 10),
        ('RIGHTPADDING', (0,0),(-1,-1), 10),
        ('TOPPADDING',   (0,0),(-1,-1), 4),
        ('BOTTOMPADDING',(0,0),(-1,-1), 4),
        ('LINEBEFORE',   (0,0),(0,-1),  3, accent),
        ('BOX',          (0,0),(-1,-1), 0.4, RULE_GRAY),
    ]))
    return t

def bullet_list(items):
    return [Paragraph(f"&#8226;  {i}", BULLET) for i in items]

# ── Cover Page ───────────────────────────────────────────────────────────────

def draw_cover(buf):
    c = rl_canvas.Canvas(buf, pagesize=A4)

    # Full dark sidebar left
    c.setFillColor(STEEL_BLUE)
    c.rect(0, 0, W, H, fill=1, stroke=0)

    # White content area
    margin = 2.5*cm
    c.setFillColor(WHITE)
    c.roundRect(margin, 3.5*cm, W - margin*1.5, H - 5*cm, 6, fill=1, stroke=0)

    # Top accent strip
    c.setFillColor(LIGHT_BLUE)
    c.rect(0, H - 1.2*cm, W, 1.2*cm, fill=1, stroke=0)

    # Bottom strip
    c.setFillColor(colors.HexColor("#154360"))
    c.rect(0, 0, W, 1*cm, fill=1, stroke=0)

    # Product name large
    c.setFont('Helvetica-Bold', 40); c.setFillColor(STEEL_BLUE)
    c.drawString(margin + 1*cm, H - 4.5*cm, "CrisisNexus")

    # Divider line
    c.setStrokeColor(LIGHT_BLUE); c.setLineWidth(2)
    c.line(margin + 1*cm, H - 5.1*cm, W - margin*1.5 - 1*cm, H - 5.1*cm)

    # Subtitle
    c.setFont('Helvetica', 13); c.setFillColor(MID_GRAY)
    c.drawString(margin + 1*cm, H - 5.8*cm, "AI-Powered Crisis Detection, Decision Intelligence,")
    c.drawString(margin + 1*cm, H - 6.4*cm, "and Relief Coordination Platform")

    # Document type label
    c.setFillColor(PALE_BLUE)
    c.roundRect(margin + 1*cm, H - 8.2*cm, 10*cm, 1*cm, 3, fill=1, stroke=0)
    c.setFont('Helvetica-Bold', 9); c.setFillColor(STEEL_BLUE)
    c.drawString(margin + 1.4*cm, H - 7.75*cm, "PROFESSIONAL SYSTEM DESIGN DOCUMENT")

    # Module pills
    pill_y = H - 10.5*cm
    for i, (label, col) in enumerate([
        ("CIRO", STEEL_BLUE), ("ReliefCycle", LIGHT_BLUE), ("Antigravity Trace", MID_GRAY)
    ]):
        px = margin + 1*cm + i * 5*cm
        c.setFillColor(col)
        c.roundRect(px, pill_y, 4.4*cm, 0.7*cm, 3, fill=1, stroke=0)
        c.setFont('Helvetica-Bold', 9); c.setFillColor(WHITE)
        c.drawCentredString(px + 2.2*cm, pill_y + 0.22*cm, label)

    # Subtitle text
    c.setFont('Helvetica', 9.5); c.setFillColor(MID_GRAY)
    c.drawString(margin + 1*cm, H - 12*cm, "System Workflow  ·  Operational Scenario  ·  Architecture Analysis")

    # Footer strip labels
    c.setFont('Helvetica', 8); c.setFillColor(colors.HexColor("#AED6F1"))
    c.drawString(margin, 0.35*cm, "Hackathon Submission  ·  CrisisNexus Team  ·  2025")
    c.drawRightString(W - margin, 0.35*cm, "CONFIDENTIAL")

    c.showPage(); c.save()

# ── Flowchart Page ────────────────────────────────────────────────────────────

def draw_flowchart(buf):
    c = rl_canvas.Canvas(buf, pagesize=A4)
    c.setFillColor(WHITE); c.rect(0, 0, W, H, fill=1, stroke=0)

    # Title bar
    c.setFillColor(STEEL_BLUE)
    c.rect(0, H - 1.6*cm, W, 1.6*cm, fill=1, stroke=0)
    c.setFont('Helvetica-Bold', 13); c.setFillColor(WHITE)
    c.drawString(1.5*cm, H - 1.1*cm, "Section 10 — Visual System Flowchart")
    c.setFont('Helvetica', 9); c.setFillColor(colors.HexColor("#AED6F1"))
    c.drawRightString(W - 1.5*cm, H - 1.1*cm, "CrisisNexus  End-to-End Operational Pipeline")

    # Helper funcs
    def box(cx, cy, w, h, label, sub="", fill_col=PALE_BLUE, text_col=STEEL_BLUE, r=4):
        c.setFillColor(fill_col)
        c.roundRect(cx - w/2, cy - h/2, w, h, r, fill=1, stroke=0)
        c.setStrokeColor(LIGHT_BLUE); c.setLineWidth(0.5)
        c.roundRect(cx - w/2, cy - h/2, w, h, r, fill=0, stroke=1)
        c.setFont('Helvetica-Bold', 7.5); c.setFillColor(text_col)
        if sub:
            c.drawCentredString(cx, cy + 4, label)
            c.setFont('Helvetica', 6.5); c.setFillColor(MID_GRAY)
            c.drawCentredString(cx, cy - 5, sub)
        else:
            c.drawCentredString(cx, cy - 2, label)

    def header_box(cx, cy, w, h, label, fill_col=STEEL_BLUE):
        c.setFillColor(fill_col)
        c.roundRect(cx - w/2, cy - h/2, w, h, 4, fill=1, stroke=0)
        c.setFont('Helvetica-Bold', 8); c.setFillColor(WHITE)
        c.drawCentredString(cx, cy - 3, label)

    def arrow(x1, y1, x2, y2):
        c.setStrokeColor(colors.HexColor("#7FB3D3")); c.setLineWidth(1)
        c.line(x1, y1, x2, y2)
        # arrowhead
        import math
        dx = x2-x1; dy = y2-y1
        length = math.sqrt(dx*dx+dy*dy)
        if length == 0: return
        ux = dx/length; uy = dy/length
        px = -uy; py = ux
        size = 4
        p = c.beginPath()
        p.moveTo(x2, y2)
        p.lineTo(x2 - ux*size + px*size*0.5, y2 - uy*size + py*size*0.5)
        p.lineTo(x2 - ux*size - px*size*0.5, y2 - uy*size - py*size*0.5)
        p.close()
        c.setFillColor(colors.HexColor("#7FB3D3")); c.drawPath(p, fill=1, stroke=0)

    def harrow(x1, y, x2):
        arrow(x1, y, x2, y)

    def varrow(x, y1, y2):
        arrow(x, y1, x, y2)

    # ── Layout constants ─────────────────────────────────────────────────────
    bw = 3.8*cm;  bh = 0.85*cm   # standard box
    cx = W/2                       # center column x
    top = H - 2.2*cm

    # START node
    c.setFillColor(STEEL_BLUE)
    c.circle(cx, top - 0.4*cm, 0.3*cm, fill=1, stroke=0)
    c.setFont('Helvetica-Bold', 7); c.setFillColor(WHITE)
    c.drawCentredString(cx, top - 0.42*cm - 2.5, "START")

    # Top pipeline (center column) ───────────────────────────────────────────
    steps_top = [
        ("Passive Monitoring", "Weather · Traffic · Social · Sensors · Field"),
        ("Signal Detection", "Anomaly identification"),
        ("Multi-Source Signal Fusion", "Weighted confidence aggregation"),
        ("Conflict Resolution", "Gemini AI Reasoning Engine"),
        ("Crisis Classification", "Type · Location · Severity · Confidence"),
        ("Severity Prediction", "Impact modelling"),
        ("Impact Forecasting", "Zone spread analysis"),
        ("Resource Estimation", "Formula-based + AI contextual adjustment"),
        ("Priority Decision Engine", "Zone A / B / C triage logic"),
    ]

    y = top - 1.1*cm
    prev_y = top - 0.7*cm
    node_ys = []

    for i, (label, sub) in enumerate(steps_top):
        node_y = y - i * 1.2*cm
        node_ys.append(node_y)
        # first box gets CIRO label background
        fill = PALE_BLUE
        box(cx, node_y, bw + 2*cm, bh, label, sub, fill_col=fill)

    # Arrows top section
    varrow(cx, top - 0.7*cm, node_ys[0] + bh/2)
    for i in range(len(node_ys)-1):
        varrow(cx, node_ys[i] - bh/2, node_ys[i+1] + bh/2)

    split_y = node_ys[-1] - bh/2  # bottom of Priority Engine

    # SPLIT LINE to two branches ─────────────────────────────────────────────
    lx = W/2 - 4.4*cm   # left branch center
    rx = W/2 + 4.4*cm   # right branch center
    branch_top = split_y - 0.55*cm

    # horizontal split line
    c.setStrokeColor(colors.HexColor("#7FB3D3")); c.setLineWidth(1)
    c.line(lx, branch_top, rx, branch_top)
    varrow(cx, split_y, branch_top + 0.02)
    # branch down stubs
    varrow(lx, branch_top, branch_top - 0.02)
    varrow(rx, branch_top, branch_top - 0.02)

    # Left branch boxes ──────────────────────────────────────────────────────
    left_steps = [
        ("Stakeholder Alerts",    "Responders · Hospitals · Shelters"),
        ("Emergency Dispatch",    "Resource mobilisation"),
        ("Response Execution",    "Field operations"),
        ("Delivery Confirmation", "Status tracking"),
        ("Recovery Monitoring",   "Population recovery metrics"),
    ]
    lbw = 3.6*cm; lbh = 0.82*cm
    left_ys = []
    for j, (label, sub) in enumerate(left_steps):
        ly = branch_top - 0.55*cm - j * 1.1*cm
        left_ys.append(ly)
        box(lx, ly, lbw, lbh, label, sub, fill_col=colors.HexColor("#EBF5FB"), text_col=STEEL_BLUE)
    for j in range(len(left_ys)-1):
        varrow(lx, left_ys[j] - lbh/2, left_ys[j+1] + lbh/2)

    # Right branch boxes ─────────────────────────────────────────────────────
    right_steps = [
        ("ReliefCycle Activation","Mobile registration opens"),
        ("Citizen Registration",  "Household · Location · Needs"),
        ("Duplicate Claim Check", "CNIC · Biometric validation"),
        ("Vulnerability Scoring", "Household priority ranking"),
        ("Aid Allocation",        "Shelter · Food · Medical"),
        ("Verification",          "Delivery confirmation log"),
    ]
    rbw = 3.6*cm; rbh = 0.82*cm
    right_ys = []
    for j, (label, sub) in enumerate(right_steps):
        ry = branch_top - 0.55*cm - j * 1.1*cm
        right_ys.append(ry)
        box(rx, ry, rbw, rbh, label, sub, fill_col=colors.HexColor("#E8F8F5"), text_col=colors.HexColor("#1A5C3A"))
    for j in range(len(right_ys)-1):
        varrow(rx, right_ys[j] - rbh/2, right_ys[j+1] + rbh/2)

    # MERGE ──────────────────────────────────────────────────────────────────
    merge_y = min(left_ys[-1], right_ys[-1]) - lbh/2 - 0.6*cm
    c.setStrokeColor(colors.HexColor("#7FB3D3")); c.setLineWidth(1)
    c.line(lx, merge_y + 0.5*cm, rx, merge_y + 0.5*cm)
    varrow(lx, left_ys[-1] - lbh/2, merge_y + 0.5*cm)
    varrow(rx, right_ys[-1] - rbh/2, merge_y + 0.5*cm)
    varrow(cx, merge_y + 0.5*cm, merge_y + 0.02)

    # Bottom pipeline ────────────────────────────────────────────────────────
    bottom_steps = [
        ("Antigravity Trace Logging", "Evidence · Confidence · Alternatives · Reasoning"),
        ("Outcome Evaluation",        "Effectiveness assessment"),
        ("Recovery Analysis",         "Trend monitoring"),
        ("Crisis Closure",            "Event archived"),
        ("Archived Intelligence Report", "Full audit trail stored"),
    ]
    bot_ys = []
    for k, (label, sub) in enumerate(bottom_steps):
        by = merge_y - k * 1.05*cm
        bot_ys.append(by)
        fill = colors.HexColor("#FEF9E7") if k == 0 else PALE_BLUE
        box(cx, by, bw + 2*cm, bh, label, sub, fill_col=fill,
            text_col=colors.HexColor("#7D6608") if k == 0 else STEEL_BLUE)
    varrow(cx, merge_y, bot_ys[0] + bh/2)
    for k in range(len(bot_ys)-1):
        varrow(cx, bot_ys[k] - bh/2, bot_ys[k+1] + bh/2)

    # END node
    end_y = bot_ys[-1] - bh/2 - 0.4*cm
    c.setFillColor(STEEL_BLUE)
    c.circle(cx, end_y, 0.28*cm, fill=1, stroke=0)
    c.setFillColor(WHITE); c.circle(cx, end_y, 0.14*cm, fill=1, stroke=0)

    # ── Side Labels ──────────────────────────────────────────────────────────
    def side_label(x, y_top, y_bot, label, sub, col):
        mid = (y_top + y_bot) / 2
        c.setStrokeColor(col); c.setLineWidth(1)
        c.line(x, y_top, x, y_bot)
        c.setFillColor(col)
        c.roundRect(x - 0.15*cm, mid - 0.12*cm, 0.3*cm, 0.24*cm, 2, fill=1, stroke=0)
        # text rotated
        c.saveState()
        c.translate(x - 0.5*cm, mid)
        c.rotate(90)
        c.setFont('Helvetica-Bold', 6.5); c.setFillColor(col)
        c.drawCentredString(0, 0, label)
        c.setFont('Helvetica', 5.5); c.setFillColor(MID_GRAY)
        c.drawCentredString(0, -7, sub)
        c.restoreState()

    side_label(1.1*cm,  node_ys[0]+bh/2, node_ys[-1]-bh/2,
               "CIRO", "Detection + Reasoning + Decision", STEEL_BLUE)
    side_label(1.1*cm,  left_ys[0]+lbh/2, left_ys[-1]-lbh/2,
               "Dispatch", "Emergency Response", LIGHT_BLUE)
    side_label(W - 1.1*cm, right_ys[0]+rbh/2, right_ys[-1]-rbh/2,
               "ReliefCycle", "Civilian Relief Coordination", colors.HexColor("#1A5C3A"))
    side_label(W - 1.1*cm, bot_ys[0]+bh/2, bot_ys[-1]-bh/2,
               "Antigravity Trace", "Explainability + Transparency", colors.HexColor("#7D6608"))

    # ── Scenario summary box ─────────────────────────────────────────────────
    box_x = W - 5.2*cm; box_y = node_ys[3] - 2.2*cm
    bxw = 4.4*cm; bxh = 3.2*cm
    c.setFillColor(colors.HexColor("#FDFEFE"))
    c.roundRect(box_x, box_y, bxw, bxh, 4, fill=1, stroke=0)
    c.setStrokeColor(LIGHT_BLUE); c.setLineWidth(0.8)
    c.roundRect(box_x, box_y, bxw, bxh, 4, fill=0, stroke=1)
    c.setFillColor(STEEL_BLUE)
    c.roundRect(box_x, box_y + bxh - 0.55*cm, bxw, 0.55*cm, 4, fill=1, stroke=0)
    c.rect(box_x, box_y + bxh - 0.55*cm, bxw, 0.3*cm, fill=1, stroke=0)
    c.setFont('Helvetica-Bold', 7.5); c.setFillColor(WHITE)
    c.drawCentredString(box_x + bxw/2, box_y + bxh - 0.38*cm, "KARACHI FLOOD EXAMPLE")
    scenario_lines = [
        "500 affected", "250 food kits", "500 water kits",
        "80 shelter slots", "6 rescue boats", "4 medical teams"
    ]
    c.setFont('Helvetica', 7); c.setFillColor(DARK_GRAY)
    for si, sl in enumerate(scenario_lines):
        c.drawString(box_x + 0.4*cm, box_y + bxh - 0.95*cm - si*0.35*cm, f"• {sl}")

    # ── Caption ──────────────────────────────────────────────────────────────
    c.setFont('Helvetica-Oblique', 7.5); c.setFillColor(MID_GRAY)
    caption = "CrisisNexus transforms fragmented crisis signals into explainable, optimized, and verifiable emergency response coordination."
    c.drawCentredString(W/2, 0.7*cm, caption)

    c.showPage(); c.save()

# ── Main document ─────────────────────────────────────────────────────────────

def build_content():
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        topMargin=1.8*cm, bottomMargin=1.8*cm,
        leftMargin=2*cm, rightMargin=2*cm
    )
    cw = doc.width
    story = []

    def sec(num, title):
        story.append(Spacer(1, 6))
        story.append(SectionHeader(num, title, cw))
        story.append(Spacer(1, 8))

    def step(num, title, time=""):
        story.append(Spacer(1, 4))
        story.append(StepBar(num, title, time, cw))
        story.append(Spacer(1, 5))

    def h2(txt): story.append(Paragraph(txt, H2))
    def h3(txt): story.append(Paragraph(txt, H3))
    def body(txt): story.append(Paragraph(txt, BODY))
    def bodyL(txt): story.append(Paragraph(txt, BODY_L))
    def sp(n=8): story.append(Spacer(1, n))
    def rule(): story.append(HRule(cw))

    # ── Document Header (not cover) ─────────────────────────────────────────
    story.append(Paragraph("CrisisNexus", DOC_TITLE))
    story.append(Paragraph(
        "AI-Powered Crisis Detection, Decision Intelligence, and Relief Coordination Platform",
        H2))
    story.append(Paragraph(
        "Professional System Workflow, Operational Scenario, and Architecture Analysis",
        NOTE))
    story.append(HRule(cw, STEEL_BLUE, 1.5))
    sp(14)

    # ══════════════════════════════════════════════════════════════════════════
    # 1. Executive Overview
    # ══════════════════════════════════════════════════════════════════════════
    sec(1, "Executive Overview")
    body(
        "CrisisNexus is an advanced AI-powered crisis intelligence platform engineered to address the "
        "complete lifecycle of emergency events — from early anomaly detection through post-crisis "
        "recovery analysis. The platform integrates machine learning, multi-source data fusion, "
        "and rule-based decision engines to enable rapid, accurate, and transparent crisis response."
    )
    sp()
    body("The system is designed to:")
    for item in [
        "Detect emergencies using multi-source signals across weather, sensor, social, and field data",
        "Resolve conflicting or incomplete information through AI-assisted reasoning",
        "Classify crisis types with confidence scoring and structured metadata",
        "Predict severity trajectories and spatial spread",
        "Estimate resource requirements using formula-driven and contextual models",
        "Coordinate civilian aid through the ReliefCycle registration and allocation engine",
        "Prevent duplicate aid claims and suppress corruption vectors",
        "Track response execution across all dispatch and delivery stages",
        "Support recovery monitoring and post-event archival",
    ]:
        story.extend(bullet_list([item]))
    sp(10)

    h2("Core Module Architecture")
    sp(4)

    modules_data = [
        [Paragraph("Module", TBL_HDR), Paragraph("Full Name", TBL_HDR),
         Paragraph("Primary Responsibilities", TBL_HDR)],
        [Paragraph("CIRO", TBL_CELL), Paragraph("Crisis Intelligence & Response Orchestration", TBL_CELL),
         Paragraph("Signal fusion, crisis reasoning, classification, severity analysis, resource decisioning", TBL_CELL)],
        [Paragraph("ReliefCycle", TBL_CELL), Paragraph("Civilian Relief Lifecycle Engine", TBL_CELL),
         Paragraph("Citizen registration, aid applications, duplicate prevention, allocation tracking, delivery verification", TBL_CELL)],
        [Paragraph("Antigravity Trace", TBL_CELL), Paragraph("Decision Explainability & Audit Engine", TBL_CELL),
         Paragraph("Explainability logs, confidence scoring, reasoning transparency, fallback behavior recording", TBL_CELL)],
    ]
    story.append(tbl(modules_data, [2.5*cm, 5*cm, 7.5*cm]))
    sp(6)

    h3("CIRO — Crisis Intelligence & Response Orchestration")
    body(
        "CIRO serves as the intelligence core of CrisisNexus. It continuously aggregates incoming "
        "signals from heterogeneous data sources, applies weighted confidence fusion, resolves "
        "conflicting reports, and produces structured crisis objects that drive all downstream decisions. "
        "CIRO's resource estimation engine combines deterministic rule-based formulas with AI contextual "
        "adjustment via Gemini to account for situation-specific nuances."
    )
    sp(4)
    h3("ReliefCycle — Civilian Aid Lifecycle Engine")
    body(
        "ReliefCycle manages the full citizen-facing relief process. It opens mobile registration "
        "portals during active crises, validates submissions against existing records to prevent "
        "duplicate claims, scores households by vulnerability, assigns resource allocations, and "
        "tracks delivery from dispatch through final confirmation."
    )
    sp(4)
    h3("Antigravity Trace — Decision Explainability & Audit Engine")
    body(
        "Antigravity Trace provides a cross-cutting audit and explainability layer over all CIRO "
        "decisions. Every classification, allocation, and priority call is logged with its full "
        "evidence set, confidence evolution, rejected alternatives, and rationale. This supports "
        "post-event review, accountability reporting, and institutional trust."
    )

    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # 2. System Workflow Architecture
    # ══════════════════════════════════════════════════════════════════════════
    sec(2, "System Workflow Architecture")
    body(
        "CrisisNexus operates as a fully integrated end-to-end pipeline. The following stages "
        "describe the complete operational sequence from passive monitoring through crisis closure, "
        "illustrating how CIRO, ReliefCycle, and Antigravity Trace collaborate at each phase."
    )
    sp()

    pipeline_data = [
        [Paragraph("Phase", TBL_HDR), Paragraph("Pipeline Stages", TBL_HDR), Paragraph("Active Module", TBL_HDR)],
        [Paragraph("Detection", TBL_CELL),
         Paragraph("Passive Monitoring → Signal Detection → Multi-Source Fusion → Conflict Resolution", TBL_CELL),
         Paragraph("CIRO", TBL_CELL)],
        [Paragraph("Analysis", TBL_CELL),
         Paragraph("Crisis Classification → Severity Prediction → Impact Forecasting → Resource Optimization", TBL_CELL),
         Paragraph("CIRO", TBL_CELL)],
        [Paragraph("Coordination", TBL_CELL),
         Paragraph("Stakeholder Coordination → ReliefCycle Activation → Citizen Registration → Duplicate Prevention", TBL_CELL),
         Paragraph("CIRO + ReliefCycle", TBL_CELL)],
        [Paragraph("Execution", TBL_CELL),
         Paragraph("Aid Allocation → Dispatch Tracking → Delivery Verification", TBL_CELL),
         Paragraph("ReliefCycle", TBL_CELL)],
        [Paragraph("Closure", TBL_CELL),
         Paragraph("Recovery Monitoring → Audit Review → Crisis Closure", TBL_CELL),
         Paragraph("Antigravity Trace", TBL_CELL)],
    ]
    story.append(tbl(pipeline_data, [2.8*cm, 8.5*cm, 3.7*cm]))
    sp(6)
    body(
        "All three modules run concurrently during active crises. Antigravity Trace logs every "
        "decision in real time, while CIRO continues to reassess severity as new signals arrive. "
        "ReliefCycle remains active until the final delivery verification is confirmed and closed."
    )

    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # 3. Real-Life Operational Scenario
    # ══════════════════════════════════════════════════════════════════════════
    sec(3, "Real-Life Operational Scenario")
    h2("Karachi Urban Mega Flood")
    sp(4)

    scenario_data = [
        [Paragraph("Parameter", TBL_HDR), Paragraph("Detail", TBL_HDR)],
        [Paragraph("Location", TBL_CELL),       Paragraph("Korangi and Malir Districts, Karachi, Pakistan", TBL_CELL)],
        [Paragraph("Event Type", TBL_CELL),      Paragraph("Severe monsoon flooding — drainage infrastructure failure", TBL_CELL)],
        [Paragraph("Affected Population", TBL_CELL), Paragraph("500 individuals across multiple zones", TBL_CELL)],
        [Paragraph("Missing Persons", TBL_CELL), Paragraph("Reported; search and rescue activated", TBL_CELL)],
        [Paragraph("Access Conditions", TBL_CELL),Paragraph("Multiple roads blocked; emergency vehicles rerouted", TBL_CELL)],
        [Paragraph("Information Quality", TBL_CELL),Paragraph("Conflicting social and field reports at initial stage", TBL_CELL)],
        [Paragraph("Shelter Status", TBL_CELL),  Paragraph("Overloaded; allocation management required", TBL_CELL)],
        [Paragraph("Fraud Risk", TBL_CELL),       Paragraph("Duplicate aid applications detected and blocked", TBL_CELL)],
        [Paragraph("Spread Risk", TBL_CELL),       Paragraph("Worsening flood front; secondary zone impact forecast", TBL_CELL)],
    ]
    story.append(tbl(scenario_data, [4.5*cm, 10.5*cm]))
    sp(6)
    body(
        "This scenario serves as the primary validation use-case for CrisisNexus, exercising every "
        "module and operational pathway within the system. The following section walks through all "
        "20 workflow steps as they would execute in this scenario."
    )

    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # 4. Full Step-by-Step Crisis Workflow
    # ══════════════════════════════════════════════════════════════════════════
    sec(4, "Full Step-by-Step Crisis Workflow")

    # Step 1
    step(1, "Passive Monitoring", "T–∞")
    body("CIRO maintains continuous passive surveillance across five primary data channels:")
    story.extend(bullet_list([
        "Weather APIs — precipitation levels, storm indices, flood watch alerts",
        "Traffic APIs — congestion patterns, road closures, emergency vehicle flow",
        "Social media streams — citizen-reported observations, hashtag monitoring, photo/video metadata",
        "Field reports — structured submissions from on-ground responders and partner agencies",
        "Water-level sensor feeds — IoT-connected gauges at drains, rivers, and retention basins",
    ]))
    story.append(info_box(["System State: MONITORING", "Active Channels: 5", "Anomaly Flags: 0", "Alert Level: GREEN"]))
    sp()

    # Step 2
    step(2, "Early Signal Detection", "T+0")
    body(
        "The first anomaly is detected when rainfall measurements exceed the 85th-percentile historical "
        "threshold for the Korangi district. Simultaneously, citizen reports begin appearing on social "
        "platforms referencing street-level flooding. CIRO flags a potential anomaly and begins "
        "active signal collection."
    )
    story.append(info_box(["Rainfall Spike: +340% above baseline", "Social Reports: 12 in 8 minutes", "Anomaly Flag: RAISED", "Confidence: 0.41"]))
    sp()

    # Step 3
    step(3, "Signal Escalation", "T+4m")
    body(
        "Traffic monitoring detects significant congestion on key arterial roads. Field responder units "
        "submit initial situation reports confirming surface flooding. Confidence score rises sharply as "
        "corroborating signals accumulate across independent channels."
    )
    story.append(info_box(["Traffic Congestion Index: +280%", "Field Reports: 3 (confirming flooding)", "Sensor Trigger: Water level sensor #7 exceeded", "Confidence: 0.67"]))
    sp()

    # Step 4
    step(4, "AI Conflict Resolution", "T+7m")
    body(
        "Conflicting reports emerge: social media posts describe a 'dam burst', while field teams "
        "report a 'drainage infrastructure collapse'. These classifications carry different resource "
        "implications. CIRO's Gemini-powered reasoning engine evaluates both claims against hydrological "
        "sensor data, municipal infrastructure maps, and historical incident records. "
        "The dam burst hypothesis is rejected due to absence of upstream pressure anomalies. "
        "The final classification is confirmed as Urban Flash Flood."
    )
    story.append(info_box([
        "Claim A (Social): Dam burst — REJECTED (no upstream anomaly)",
        "Claim B (Field): Drainage collapse — CONFIRMED",
        "Final Classification: Urban Flash Flood",
        "Confidence: 0.92",
        "Reasoning Engine: Gemini AI",
    ], accent=ACCENT_GRN))
    sp()

    # Step 5
    step(5, "Crisis Classification", "T+8m")
    body("CIRO generates a structured crisis object containing all metadata required for downstream processing:")
    story.append(info_box([
        "Crisis ID:          KHI-2025-FLOOD-0047",
        "Type:               Urban Flash Flood",
        "Severity:           HIGH (Level 3 of 5)",
        "Location:           Korangi / Malir, Karachi",
        "Affected Pop:       500 (estimated)",
        "Confidence Score:   0.92",
        "Timestamp:          2025-08-14 03:41 UTC+5",
    ]))
    sp()

    # Step 6
    step(6, "Impact Forecasting", "T+10m")
    body(
        "CIRO's impact forecasting model projects the flood front's progression based on current "
        "drainage saturation, topographical gradient, and historical flood path data. Secondary "
        "flooding risk is elevated for three adjacent zones. A 60-minute propagation window is estimated "
        "before adjacent residential blocks are affected."
    )
    sp()

    # Step 7
    step(7, "Resource Estimation", "T+11m")
    body("The resource engine applies the following formulas to the 500-person affected population:")
    res_data = [
        [Paragraph("Resource", TBL_HDR), Paragraph("Formula", TBL_HDR), Paragraph("Quantity", TBL_HDR), Paragraph("Adjustment", TBL_HDR)],
        [Paragraph("Food Kits", TBL_CELL), Paragraph("1 kit per 2 persons", TBL_CELL), Paragraph("250", TBL_CELL_C), Paragraph("+10% buffer", TBL_CELL)],
        [Paragraph("Water Kits", TBL_CELL), Paragraph("2 L/person/day × 500", TBL_CELL), Paragraph("500", TBL_CELL_C), Paragraph("+15% contamination risk", TBL_CELL)],
        [Paragraph("Shelter Slots", TBL_CELL), Paragraph("35% displacement rate × 500", TBL_CELL), Paragraph("80", TBL_CELL_C), Paragraph("Nearest 10-unit block", TBL_CELL)],
        [Paragraph("Medical Teams", TBL_CELL), Paragraph("1 team per 120 affected", TBL_CELL), Paragraph("4", TBL_CELL_C), Paragraph("+1 for missing persons", TBL_CELL)],
        [Paragraph("Rescue Boats", TBL_CELL), Paragraph("Gemini contextual estimate", TBL_CELL), Paragraph("6", TBL_CELL_C), Paragraph("Road-blocked zones priority", TBL_CELL)],
    ]
    story.append(tbl(res_data, [2.6*cm, 4.5*cm, 2*cm, 5.9*cm]))
    sp()

    # Step 8
    step(8, "Multi-Zone Prioritization", "T+13m")
    body("The affected population is segmented into three priority zones:")
    zone_data = [
        [Paragraph("Zone", TBL_HDR), Paragraph("Population", TBL_HDR), Paragraph("Condition", TBL_HDR), Paragraph("Priority", TBL_HDR)],
        [Paragraph("Zone A — Korangi Core", TBL_CELL), Paragraph("150", TBL_CELL_C), Paragraph("Trapped civilians, road access blocked", TBL_CELL), Paragraph("CRITICAL", TBL_CELL)],
        [Paragraph("Zone B — Malir Elderly Block", TBL_CELL), Paragraph("100", TBL_CELL_C), Paragraph("Elderly residents, power outage", TBL_CELL), Paragraph("HIGH", TBL_CELL)],
        [Paragraph("Zone C — Displaced Camp", TBL_CELL), Paragraph("250", TBL_CELL_C), Paragraph("Displaced but stable, shelter capacity limited", TBL_CELL), Paragraph("MEDIUM", TBL_CELL)],
    ]
    story.append(tbl(zone_data, [4*cm, 2.2*cm, 6.5*cm, 2.3*cm]))
    sp(4)
    body(
        "Zone A receives absolute priority due to active entrapment risk. Zone B is elevated above "
        "Zone C because the elderly population has high medical vulnerability and reduced self-sufficiency "
        "during power outages. Zone C receives allocation after Zones A and B are stabilised."
    )
    sp()

    # Step 9
    step(9, "Stakeholder Alerts", "T+14m")
    body("CrisisNexus dispatches structured alert packages to all registered emergency stakeholders:")
    story.extend(bullet_list([
        "Emergency Responders — GPS-tagged dispatch orders with resource manifests",
        "Hospitals — Patient surge advisories and triage pre-positioning",
        "Shelter Operators — Capacity activation and intake preparation",
        "Citizens — Public broadcast via SMS, app notifications, and broadcast media",
    ]))
    sp()

    # Step 10
    step(10, "ReliefCycle Activation", "T+15m")
    body(
        "The ReliefCycle module activates its citizen-facing registration portal, linked directly to "
        "the crisis object generated by CIRO. Registration is geofenced to the affected district "
        "and time-bounded to prevent false submissions from outside the impact zone."
    )
    sp()

    # Step 11
    step(11, "Citizen Registration", "T+16m onward")
    body("Affected families submit registration requests with the following mandatory fields:")
    story.extend(bullet_list([
        "Household size and composition (adults, children, elderly)",
        "GPS-confirmed location",
        "Emergency type experienced (flooding, structural damage, displacement)",
        "Medical urgency flags (injury, chronic conditions, mobility impairment)",
    ]))
    sp()

    # Step 12
    step(12, "Duplicate Prevention", "T+16m onward")
    body(
        "Each submission is validated against the CNIC (national identity) database and biometric "
        "records. If an identical household identifier has already submitted a claim in the same "
        "crisis event, the duplicate request is automatically denied and flagged for review. "
        "Repeated fraud attempts trigger escalation to the Antigravity Trace audit log."
    )
    story.append(info_box([
        "Validation Method: CNIC + Biometric cross-check",
        "Duplicate Found: DENY + FLAG + LOG",
        "Fraud Escalation: Antigravity Trace entry created",
        "Latency per Check: ~200ms",
    ], accent=ACCENT_RED))
    sp()

    # Step 13
    step(13, "Vulnerability Scoring", "T+17m onward")
    body("Each registered household is assigned a vulnerability score using a weighted composite index:")
    score_data = [
        [Paragraph("Factor", TBL_HDR), Paragraph("Weight", TBL_HDR), Paragraph("Rationale", TBL_HDR)],
        [Paragraph("Household Size", TBL_CELL), Paragraph("15%", TBL_CELL_C), Paragraph("Larger households require more resources", TBL_CELL)],
        [Paragraph("Children Present", TBL_CELL), Paragraph("20%", TBL_CELL_C), Paragraph("Higher medical and shelter vulnerability", TBL_CELL)],
        [Paragraph("Elderly Present", TBL_CELL), Paragraph("20%", TBL_CELL_C), Paragraph("Mobility constraints, health risk", TBL_CELL)],
        [Paragraph("Medical Urgency", TBL_CELL), Paragraph("25%", TBL_CELL_C), Paragraph("Immediate intervention required", TBL_CELL)],
        [Paragraph("Flood Severity at Location", TBL_CELL), Paragraph("10%", TBL_CELL_C), Paragraph("Zone A/B/C designation", TBL_CELL)],
        [Paragraph("Missing Persons Link", TBL_CELL), Paragraph("10%", TBL_CELL_C), Paragraph("Search escalation required", TBL_CELL)],
    ]
    story.append(tbl(score_data, [4.5*cm, 2*cm, 8.5*cm]))
    sp()

    # Step 14
    step(14, "Resource Allocation", "T+20m")
    body(
        "Allocations are assigned in descending vulnerability score order until resources are "
        "exhausted. Each allocation record specifies the household ID, assigned resource type, "
        "quantity, and pickup/delivery point. Remaining demand is queued for the next resource "
        "dispatch cycle."
    )
    sp()

    # Step 15
    step(15, "Dispatch Execution and Tracking", "T+22m onward")
    body("Each aid unit follows a tracked lifecycle:")
    status_data = [
        [Paragraph("Status", TBL_HDR), Paragraph("Definition", TBL_HDR)],
        [Paragraph("REQUESTED",  TBL_CELL), Paragraph("Household submission received and validated", TBL_CELL)],
        [Paragraph("ALLOCATED",  TBL_CELL), Paragraph("Resource assigned from available inventory", TBL_CELL)],
        [Paragraph("DISPATCHED", TBL_CELL), Paragraph("Physical dispatch confirmed, ETA logged", TBL_CELL)],
        [Paragraph("DELIVERED",  TBL_CELL), Paragraph("Delivery agent confirms physical handover", TBL_CELL)],
        [Paragraph("CONFIRMED",  TBL_CELL), Paragraph("Recipient acknowledges receipt via app or agent", TBL_CELL)],
    ]
    story.append(tbl(status_data, [3.5*cm, 11.5*cm]))
    sp()

    # Step 16
    step(16, "Missing Persons Escalation", "T+25m")
    body(
        "Where a registration references missing household members, CIRO elevates the search "
        "priority flag and dispatches coordinated alerts to search-and-rescue teams. Severity "
        "scores are recalculated to account for life-risk escalation in those zones."
    )
    sp()

    # Step 17
    step(17, "Delivery Verification", "T+Ongoing")
    body(
        "Every delivery is confirmed through a dual-verification mechanism: the delivery agent "
        "logs a GPS-stamped delivery confirmation, and the recipient submits acknowledgment via "
        "the mobile portal or through an agent-mediated confirmation. Both logs are stored in "
        "the immutable Antigravity Trace audit record."
    )
    sp()

    # Step 18
    step(18, "Antigravity Trace Review", "T+Continuous")
    body("The full decision trace for this event is accessible as a structured audit record:")
    story.append(info_box([
        "decision_id:        KHI-2025-DEC-0047-A",
        "evidence_sources:   [Weather API, Sensor #7, Field Report #3, Social Fusion]",
        "confidence_0:       0.41  → confidence_final: 0.92",
        "rejected_alt:       [Dam Burst — upstream anomaly absent]",
        "selected_action:    Urban Flash Flood Classification",
        "resources_assigned: [250 food, 500 water, 80 shelter, 4 medical, 6 boats]",
        "fallback_triggered: False",
        "audit_status:       COMPLETE",
    ]))
    sp()

    # Step 19
    step(19, "Recovery Monitoring", "T+Hours")
    body(
        "CIRO continues passive monitoring post-peak. Severity scoring is downgraded as water "
        "levels recede, road access is restored, and confirmed-delivered aid records accumulate. "
        "Population recovery is tracked against the original impact estimate. When fewer than "
        "10% of households remain in active-need status, the crisis transitions to recovery phase."
    )
    sp()

    # Step 20
    step(20, "Crisis Closure", "T+Recovery")
    body(
        "Upon recovery threshold confirmation, the crisis event is formally closed. A complete "
        "intelligence archive is generated, including signal logs, decision traces, resource "
        "utilisation records, delivery confirmations, and Antigravity Trace audit exports. "
        "This archive is available for post-event review, institutional accountability, and "
        "machine learning improvement cycles."
    )

    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # 5. How Crisis Detection Works
    # ══════════════════════════════════════════════════════════════════════════
    sec(5, "How Crisis Detection Works")
    body(
        "CIRO's detection mechanism is built on a weighted multi-source confidence fusion model. "
        "Each data channel contributes a confidence score proportional to its historical reliability "
        "and real-time signal strength. The composite score determines whether a crisis threshold "
        "is crossed and what classification action is triggered."
    )
    sp()
    h2("Confidence Weighting by Signal Source")
    conf_data = [
        [Paragraph("Signal Source", TBL_HDR), Paragraph("Base Weight", TBL_HDR), Paragraph("Rationale", TBL_HDR)],
        [Paragraph("Field Reports", TBL_CELL),  Paragraph("0.95", TBL_CELL_C), Paragraph("Ground-truth verification; highest reliability", TBL_CELL)],
        [Paragraph("Sensor Feed", TBL_CELL),    Paragraph("0.90", TBL_CELL_C), Paragraph("IoT sensors provide objective physical measurements", TBL_CELL)],
        [Paragraph("Weather API", TBL_CELL),    Paragraph("0.75", TBL_CELL_C), Paragraph("Validated meteorological data, predictive accuracy ~80%", TBL_CELL)],
        [Paragraph("Traffic API", TBL_CELL),    Paragraph("0.60", TBL_CELL_C), Paragraph("Indirect indicator; subject to non-crisis congestion", TBL_CELL)],
        [Paragraph("Social Reports", TBL_CELL), Paragraph("0.45", TBL_CELL_C), Paragraph("High noise; valuable for spread and sentiment", TBL_CELL)],
    ]
    story.append(tbl(conf_data, [4*cm, 2.5*cm, 8.5*cm]))
    sp(6)
    h2("Fusion Logic and Threshold Detection")
    body(
        "The composite confidence score is computed as a weighted mean across all active channels. "
        "When the composite score exceeds 0.70, the system enters active crisis classification mode. "
        "When it exceeds 0.85, automatic resource estimation and stakeholder alerting are triggered "
        "without requiring manual confirmation. This threshold-based escalation ensures rapid response "
        "while minimising false positive activations."
    )
    story.append(info_box([
        "Composite Score Formula: Σ(weight_i × signal_i) / Σ(weight_i)",
        "Threshold — Active Classification: > 0.70",
        "Threshold — Automatic Escalation:  > 0.85",
        "Karachi Event Final Score:          0.92 → Full activation",
    ]))

    sp(10)

    # ══════════════════════════════════════════════════════════════════════════
    # 6. How Resource Estimation Works
    # ══════════════════════════════════════════════════════════════════════════
    sec(6, "How Resource Estimation Works")
    body(
        "CrisisNexus uses a hybrid resource estimation model combining deterministic rule-based "
        "formulas with AI-assisted contextual adjustment via Gemini. The rule-based layer provides "
        "a reproducible baseline, while Gemini adjusts quantities based on crisis-specific factors "
        "such as access restrictions, infrastructure damage, and demographic risk profiles."
    )
    sp()
    formula_data = [
        [Paragraph("Resource", TBL_HDR), Paragraph("Base Formula", TBL_HDR), Paragraph("AI Adjustment Factors", TBL_HDR)],
        [Paragraph("Food Kits", TBL_CELL), Paragraph("Affected pop ÷ 2", TBL_CELL), Paragraph("Duration estimate, supply chain disruption", TBL_CELL)],
        [Paragraph("Water Kits", TBL_CELL), Paragraph("2 L × affected pop", TBL_CELL), Paragraph("Contamination risk, temperature, medical cases", TBL_CELL)],
        [Paragraph("Shelter Slots", TBL_CELL), Paragraph("35% × affected pop", TBL_CELL), Paragraph("Structural damage rate, household composition", TBL_CELL)],
        [Paragraph("Medical Teams", TBL_CELL), Paragraph("Affected pop ÷ 120", TBL_CELL), Paragraph("Injury prevalence, missing persons, elderly ratio", TBL_CELL)],
        [Paragraph("Rescue Boats", TBL_CELL), Paragraph("Gemini contextual", TBL_CELL), Paragraph("Road closure data, water depth, zone geography", TBL_CELL)],
    ]
    story.append(tbl(formula_data, [3*cm, 4.5*cm, 7.5*cm]))

    sp(10)

    # ══════════════════════════════════════════════════════════════════════════
    # 7. Antigravity Trace Integration
    # ══════════════════════════════════════════════════════════════════════════
    sec(7, "Antigravity Trace Integration")
    body(
        "Antigravity Trace operates as a persistent, immutable reasoning ledger embedded across "
        "all CrisisNexus decision points. Every significant action taken by CIRO or ReliefCycle "
        "generates a structured trace entry. These entries support post-event audit, legal "
        "accountability, institutional reporting, and continuous model improvement."
    )
    sp()
    h2("Sample Trace Object Structure")
    story.append(info_box([
        "{",
        '  "decision_id":         "KHI-2025-DEC-0047-A",',
        '  "crisis_ref":          "KHI-2025-FLOOD-0047",',
        '  "timestamp":           "2025-08-14T03:49:00+05:00",',
        '  "evidence_sources": [',
        '     "Weather API — rainfall index 0.88",',
        '     "Sensor #7 — water level threshold exceeded",',
        '     "Field Report #3 — drainage collapse confirmed",',
        '     "Social Fusion — 47 posts, 0.45 weight"',
        '  ],',
        '  "confidence_evolution":  [0.41, 0.67, 0.82, 0.92],',
        '  "rejected_alternatives": ["Dam Burst — upstream pressure normal"],',
        '  "selected_action":       "Urban Flash Flood Classification",',
        '  "resources_committed":   {"food":250,"water":500,"shelter":80,"medical":4,"boats":6},',
        '  "fallback_triggered":    false,',
        '  "audit_status":          "COMPLETE"',
        "}",
    ]))

    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # 8. Innovation and Real-World Impact
    # ══════════════════════════════════════════════════════════════════════════
    sec(8, "Innovation and Real-World Impact")
    problems_data = [
        [Paragraph("Problem", TBL_HDR), Paragraph("CrisisNexus Solution", TBL_HDR)],
        [Paragraph("Delayed detection", TBL_CELL), Paragraph("Multi-source continuous monitoring with sub-10-minute anomaly response", TBL_CELL)],
        [Paragraph("Misinformation", TBL_CELL), Paragraph("AI conflict resolution cross-referencing sensor and field data against social claims", TBL_CELL)],
        [Paragraph("Poor coordination", TBL_CELL), Paragraph("Centralised stakeholder alerting with structured, machine-readable dispatch orders", TBL_CELL)],
        [Paragraph("Duplicate aid abuse", TBL_CELL), Paragraph("Biometric + CNIC validation with real-time duplicate detection and fraud logging", TBL_CELL)],
        [Paragraph("Lack of transparency", TBL_CELL), Paragraph("Full Antigravity Trace audit records for every decision, accessible post-event", TBL_CELL)],
    ]
    story.append(tbl(problems_data, [4*cm, 11*cm]))
    sp(8)
    h2("Applicable Crisis Scenarios")
    story.extend(bullet_list([
        "Floods and flash floods — primary design case",
        "Earthquakes — structural collapse triage and survivor registration",
        "Heatwaves — medical escalation and vulnerability-weighted cooling resource dispatch",
        "Infrastructure failures — utility outage coordination and public safety alerting",
        "Urban emergencies — multi-agency coordination for complex urban incidents",
    ]))

    sp(10)

    # ══════════════════════════════════════════════════════════════════════════
    # 9. Conclusion
    # ══════════════════════════════════════════════════════════════════════════
    sec(9, "Conclusion")
    body(
        "CrisisNexus represents a fundamental advancement in the architecture of emergency response "
        "systems. By integrating AI-powered signal fusion, structured decision intelligence, and "
        "transparent audit logging into a single cohesive platform, CrisisNexus closes the operational "
        "gaps that define the difference between effective crisis management and systemic failure."
    )
    sp(4)
    body(
        "The platform is designed to scale across crisis types, geographies, and institutional "
        "contexts. Its modular architecture — CIRO for intelligence, ReliefCycle for civilian "
        "coordination, and Antigravity Trace for accountability — enables deployment across "
        "municipal, national, and international emergency management frameworks."
    )
    sp(4)
    body(
        "CrisisNexus is not an incremental improvement. It is an AI-native rethinking of how "
        "emergency systems detect, decide, coordinate, and account for their actions. It is "
        "designed to be the operational backbone of resilient disaster response — fast enough "
        "to matter, transparent enough to trust, and verifiable enough to deploy at scale."
    )
    sp(8)

    # Footer note
    story.append(HRule(cw, STEEL_BLUE, 1))
    sp(4)
    story.append(Paragraph(
        "CrisisNexus  ·  Professional System Design Document  ·  Hackathon Submission 2025  ·  Confidential",
        FOOTER_S))

    doc.build(story)
    return buf

# ── Assembly ──────────────────────────────────────────────────────────────────

def main():
    out = "CrisisNexus_System_Design.pdf"

    cover_buf   = BytesIO()
    chart_buf   = BytesIO()
    content_buf = BytesIO()

    draw_cover(cover_buf)
    draw_flowchart(chart_buf)
    content_buf = build_content()

    writer = PdfWriter()
    for rb in [cover_buf, content_buf, chart_buf]:
        rb.seek(0)
        r = PdfReader(rb)
        for pg in r.pages:
            writer.add_page(pg)

    with open(out, 'wb') as f:
        writer.write(f)
    print(f"Done: {out}")

main()
