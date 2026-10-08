"""
Gera src/lib/eventTemplate/manifest.json a partir do modelo oficial de eventos.

Uso:
    python3 scripts/event-template/build_manifest.py <modelo.xlsx> <saida.json> [<solicitacoes.xlsx> <solicitacoes.json>]

O arquivo de solicitações manuais é separado do modelo: o painel só junta as abas dele
ao final do documento quando há solicitações (veja merge_sheets.py --only).

O manifesto descreve, para cada aba suportada, onde ficam os campos editáveis,
as vagas de itens (nome, imagem, ID) e quais linhas ocultar quando uma vaga ou
bloco não for usado. Nada além desses pontos é alterado na exportação.
Ao trocar a versão do modelo, rode este script e o teste de ida e volta
(src/lib/eventTemplate/eventTemplate.test.ts) antes de publicar.
"""
import hashlib, json, re, sys
import openpyxl
from openpyxl.utils import get_column_letter as L, column_index_from_string as CI

SRC, OUT = sys.argv[1], sys.argv[2]
REQ, REQ_OUT = (sys.argv[3], sys.argv[4]) if len(sys.argv) > 4 else (None, None)
wb = openpyxl.load_workbook(SRC)
rwb = openpyxl.load_workbook(REQ) if REQ else None
VERSION = "16-anos-v2"
# Nome do arquivo que o Super Admin envia no painel (o envio confere o SHA-256).
FILE_NAME = "BR_16_years_of_DDTank_Week_-_s1-s401_ID_2.xlsx"
REQ_VERSION = "solicitacoes-v1"
REQ_FILE_NAME = "solicitacoes-manuais-v1.xlsx"


def text(ws, ref):
    v = ws[ref].value
    return "" if v is None else str(v)


def rc(ref):
    m = re.match(r"([A-Z]+)(\d+)$", ref)
    return m.group(1), int(m.group(2))


def shift(ref, dr=0, dc=0):
    c, r = rc(ref)
    return f"{L(CI(c) + dc)}{r + dr}"


SERVER_RE = re.compile(r"s1\s*-\s*s?\d{3}")


def fmt_from(ws, ref, kind):
    """Transforma o texto do modelo em um formato com marcadores."""
    t = text(ws, ref)
    if kind == "date":
        return re.sub(r"\((?:\d{2}|XX)/(?:\d{2}|XX)/\d{4}\) - \d{2}:\d{2}", "({date}) - {time}", t)
    if kind == "servers":
        def rep(m):
            return "{serversSpaced}" if " " in m.group(0) else "{servers}"
        return SERVER_RE.sub(rep, t)
    raise ValueError(kind)


def field(key, label, cell, inp, fmt="{value}", rich="plain", options=None):
    f = {"key": key, "label": label, "cell": cell, "input": inp, "format": fmt, "rich": rich}
    if options:
        f["options"] = options
    return f


def dates(ws, start, end, prefix=""):
    return [
        field(prefix + "start", "Início", start, "datetime", fmt_from(ws, start, "date"), "date"),
        field(prefix + "end", "Fim", end, "datetime", fmt_from(ws, end, "date"), "date"),
    ]


def title(ws, cell, key="title"):
    return field(key, "Título da aba", cell, "derived", fmt_from(ws, cell, "servers"))


def item_slot(name, image=None, cells=None, hide=None, decorations=None):
    s = {"cells": [{"cell": name, "format": "{label}", "rich": "itemLabel"}] + (cells or [])}
    if image:
        s["image"] = image
    if hide:
        s["hideRows"] = hide
    if decorations:
        s["decorations"] = decorations
    return s


def group(key, label, slots, style="twoLines", kind="items"):
    return {"key": key, "label": label, "kind": kind, "labelStyle": style, "slots": slots}


def block(fields, groups, hide=None, hide_cols=None, children=None):
    b = {"fields": fields, "groups": groups}
    if hide:
        b["hideRows"] = hide
    if hide_cols:
        b["hideCols"] = hide_cols
    if children:
        b["children"] = children
    return b


def sset(key, label, blocks, min_blocks=1, block_label=None):
    return {"key": key, "label": label, "blockLabel": block_label or label, "minBlocks": min_blocks, "blocks": blocks}


def sheet_name_pattern(name):
    base = re.sub(r"\s+\d+$", "", name)  # remove sufixo " 1", " 2" das cópias do modelo
    base = re.sub(r"\s+KICK$", "", base)
    return SERVER_RE.sub("{servers}", base)


layouts = []


def layout(idx, lid, type_, label, description, fields, sets, book=None, into=None, **extra):
    ws = (book or wb).worksheets[idx]
    d = {
        "id": lid, "type": type_, "label": label, "description": description,
        "sheet": ws.title, "sheetNamePattern": sheet_name_pattern(ws.title),
        "fields": fields, "sets": sets,
        # Células mescladas do topo da aba: várias abas têm o mesmo padrão de nome
        # ("BR-Missions {servers}"), então a importação reconhece o layout pela estrutura.
        "signature": sorted(str(m) for m in ws.merged_cells.ranges if m.min_row <= 30)[:40],
    }
    d.update(extra)
    (layouts if into is None else into).append(d)


# ---------------------------------------------------------------- Entrada diária (capa)
ws = wb.worksheets[0]
queues = [block(
    [field("label", "Fila", f"N{r}", "text"),
     field("idLine", "ID / Quantidade", f"O{r + 2}", "derived", "{idLine:items}", "idLine")],
    [group("items", "Itens", [item_slot(f"{c1}{r}", f"{c1}{r}:{c2}{r + 1}") for c1, c2 in (("O", "Q"), ("R", "T"), ("U", "W"))])],
    hide=[r, r + 2],
) for r in (22, 25, 28)]
days = block([], [group("items", "Dias", [
    item_slot(f"P{r}", f"U{r}:U{r}", [{"cell": f"V{r}", "format": "{idAmount}", "rich": "idLine"}], hide=[r, r])
    for r in range(34, 48)])])
layout(0, "daily-14d", "daily", "Entrada Diária (7 ou 14 dias)",
       "Capa do documento, filas acumuladas de 3, 7 e 14 dias com 3 itens cada e um item por dia.",
       [title(ws, "P2"), *dates(ws, "P5", "P6"),
        field("coverTitle", "Linha do evento (capa)", "B17", "derived", "EVENT FOR THE SERVERS: {docTitle} - {docServers}")],
       [sset("queues", "Filas acumuladas", queues, 0, "Fila"), sset("days", "Itens por dia", [days], 1, "Lista")],
       cover={"hideColsWithoutSection": "L:AQ"})

# Ícones de moeda na célula de preço (posições do modelo): só Coupons fica centralizado;
# com "Coupons / Lcps" o ícone de Coupons vai para a esquerda e o de Lcps fica ao lado.
def ammo_currency_icons(r):
    box = f"E{r}:E{r}"
    return [
        {"media": "image28.png", "box": box, "when": {"currency": "Coupons"}, "offset": [605118, 481853]},
        {"media": "image28.png", "box": box, "when": {"currency": "Coupons / Lcps"}, "offset": [485775, 495300]},
        {"media": "image29.png", "box": box, "when": {"currency": "Coupons / Lcps"}, "offset": [733425, 495300]},
    ]


# ---------------------------------------------------------------- Venda de munição
ws = wb.worksheets[1]
ammo_blocks = []
for h in (7, 15, 23, 31, 39, 47, 55):
    slots = []
    for r in range(h + 1, h + 7):
        slots.append(item_slot(f"C{r}", f"D{r}:D{r}", [
            {"cell": f"E{r}", "format": "*{price} {currency}", "rich": "value"},
            {"cell": f"F{r}", "format": "{id}", "rich": "plain"},
            {"cell": f"G{r}", "format": "*{qty}", "rich": "value"},
            {"cell": f"H{r}", "format": "{condition}", "rich": "plain"},
        ], hide=[r, r], decorations=ammo_currency_icons(r)))
    ammo_blocks.append(block([], [group("items", "Itens", slots)], hide=[h, h + 7]))
layout(1, "ammo-7x6", "ammo", "Venda de Munição",
       "Até 7 blocos com 6 itens cada, com preço em cupons, quantidade e limite por servidor.",
       [title(ws, "D2"), *dates(ws, "D4", "D5")],
       [sset("blocks", "Blocos", ammo_blocks, 1, "Bloco")],
       itemFields=[
           {"key": "price", "label": "Preço", "placeholder": "120.000"},
           {"key": "currency", "label": "Moeda", "options": ["Coupons", "Coupons / Lcps"], "default": "Coupons"},
           {"key": "condition", "label": "Condição", "placeholder": "Limit 10 items per server"},
       ])

# ---------------------------------------------------------------- Missões (helpers)
def mission_block(ws, r, cols, n_items, stride_items, first_item, hide=None, choice=None, req=None, extra_fields=None, hide_items=True):
    """cols: dict com colunas name, img1, img2, pt (célula de título/descrição PT), id."""
    flds = [field("titleEn", "Título e objetivos (inglês)", f"{cols['en']}{r}", "textarea"),
            field("titlePt", "Título (PT)", f"{cols['pt']}{cols['ptTitleRow'](r)}", "text"),
            field("descPt", "Descrição (PT)", f"{cols['pt']}{cols['ptDescRow'](r)}", "textarea"),
            field("idLine", "ID / Quantidade", f"{cols['id']}{first_item}", "derived", "{idLine:items}", "idLine")]
    if extra_fields:
        flds = extra_fields + flds
    slots = []
    for j in range(n_items):
        i = first_item + j * stride_items
        slots.append(item_slot(f"{cols['name']}{i}", f"{cols['img1']}{i}:{cols['img2']}{i + stride_items - 1}",
                               hide=[i, i + stride_items - 1] if hide_items and j > 0 else None))
    groups = [group("items", "Recompensas", slots)]
    if choice:
        groups.append(choice)
        flds.append(field("orLine", "Opções (OR)", choice["_orCell"], "derived", "{orLine:choice}", "idLine"))
        del choice["_orCell"]
    if req:
        groups.insert(0, req)
    return block(flds, groups, hide=hide)


def choice_group(name_col, img1, img2, rows, or_cell, hide_rows=True):
    slots = []
    for j, o in enumerate(rows):
        h = None
        if hide_rows and j > 0:
            h = [rows[j - 1] + 3, o + 2]
        slots.append(item_slot(f"{name_col}{o}", f"{img1}{o}:{img2}{o + 2}", hide=h))
    g = group("choice", "Escolha um (OR)", slots)
    g["_orCell"] = or_cell
    return g


# ---------------------------------------------------------------- Missões 8×5
ws = wb.worksheets[2]
cols = {"en": "P", "pt": "V", "ptTitleRow": lambda r: r + 2, "ptDescRow": lambda r: r + 3, "id": "V", "name": "P", "img1": "T", "img2": "U"}
mblocks = [mission_block(ws, r, cols, 5, 3, r + 5, hide=[r, r + 20]) for r in range(9, 9 + 21 * 8, 21)]
layout(2, "missions-8x5", "mission", "Missões",
       "Missões semanais (A, B, C...) com até 5 recompensas cada, sem limite: a cada 8 missões o arquivo ganha uma aba de continuação.",
       [title(ws, "P2"), *dates(ws, "P4", "P5")],
       [sset("missions", "Missões", mblocks, 1, "Missão")])

# ---------------------------------------------------------------- Missões 3×3 + escolha
ws = wb.worksheets[3]
cols = {"en": "B", "pt": "H", "ptTitleRow": lambda r: r + 2, "ptDescRow": lambda r: r + 3, "id": "H", "name": "B", "img1": "F", "img2": "G"}
mblocks = []
for k, r in enumerate((9, 24, 39)):
    ch = choice_group("B", "F", "G", [55, 61, 67, 73], "H55") if k == 2 else None
    mblocks.append(mission_block(ws, r, cols, 3, 3, r + 5, hide=[r, r + 14], choice=ch))
layout(3, "missions-3x3-choice", "mission", "Missões com escolha",
       "Missões com 3 recompensas e, se quiser, até 4 opções \"escolha um\"; sem limite de missões (o arquivo ganha abas de continuação).",
       [title(ws, "B2"), *dates(ws, "B4", "B5")],
       [sset("missions", "Missões", mblocks, 1, "Missão")],
       hideWhenEmpty=[{"set": "missions", "block": 2, "group": "choice", "rows": [53, 75]}])

# ---------------------------------------------------------------- Missão com itens exigidos
ws = wb.worksheets[4]
req_fmt = text(ws, "Y9").replace('10 "Cristal escuro"', '{qty} "{name}"')
req_slots = []
for c in ("Y", "AA"):
    req_slots.append({
        "cells": [
            {"cell": f"{c}9", "format": req_fmt, "rich": "plain"},
            {"cell": f"{c}13", "format": "NAME: {name}", "rich": "labelValue"},
            {"cell": f"{c}14", "format": "ID: {id}", "rich": "plain"},
        ],
        "image": f"{c}11:{c}12",
    })
cols = {"en": "P", "pt": "V", "ptTitleRow": lambda r: r + 2, "ptDescRow": lambda r: r + 3, "id": "V", "name": "P", "img1": "T", "img2": "U"}
mb = mission_block(ws, 9, cols, 5, 3, 16, req=group("requirements", "Itens exigidos", req_slots, kind="requirements"))
layout(4, "missions-requirements", "mission", "Missão com itens exigidos",
       "Uma missão com até 2 itens consumidos na conclusão e até 5 recompensas.",
       [title(ws, "P2"), *dates(ws, "P4", "P5"),
        field("startLegacy", "Início (cópia)", "B4", "derived", fmt_from(ws, "B4", "date").replace("{date}", "{start.date}").replace("{time}", "{start.time}"), "date"),
        field("endLegacy", "Fim (cópia)", "B5", "derived", fmt_from(ws, "B5", "date").replace("{date}", "{end.date}").replace("{time}", "{end.time}"), "date")],
       [sset("missions", "Missão", [mb], 1, "Missão")])

# ---------------------------------------------------------------- Faça se Puder duplo
ws = wb.worksheets[6]
sides = []
for k, (en, pt, name, i1, i2, idc, t, ds, de, cols_hide) in enumerate([
        ("B", "G", "B", "E", "F", "G", "C2", "C5", "C6", None),
        ("T", "Y", "T", "W", "X", "Y", "U2", "U5", "U6", "T:AJ")]):
    cols = {"en": en, "pt": pt, "ptTitleRow": lambda r: 24, "ptDescRow": lambda r: 25, "id": idc, "name": name, "img1": i1, "img2": i2}
    r_en = 21 if k == 0 else 20
    ch = choice_group(name, i1, i2, [47, 53, 59, 65], f"{idc}47", hide_rows=False)
    b = mission_block(ws, r_en, cols, 5, 3, 30, choice=ch, hide_items=False,
                      extra_fields=[title(ws, t), *dates(ws, ds, de)])
    if cols_hide:
        b["hideCols"] = cols_hide
    sides.append(b)
layout(6, "doit-double", "doit", "Faça se Puder – 2 dias",
       "Duas missões de 24 horas lado a lado, cada uma com 5 recompensas e até 4 opções \"escolha um\".",
       [field("serverLabel", "Servidor", "M22", "derived", fmt_from(ws, "M22", "servers"))],
       [sset("missions", "Dias", sides, 1, "Dia")])

# ---------------------------------------------------------------- Faça se Puder com exigidos
ws = wb.worksheets[7]
req_fmt3 = ('This mission requires the player to have {requirementsList} in their inventory, '
            'and these items will be consumed upon completion of the mission.')
req_slots = [{"cells": [{"cell": f"{c}30", "format": "NAME: {name}", "rich": "labelValue"},
                        {"cell": f"{c}31", "format": "ID: {id}", "rich": "plain"}],
              "image": f"{c}27:{d}29"} for c, d in (("M", "N"), ("O", "P"), ("Q", "R"))]
cols = {"en": "B", "pt": "G", "ptTitleRow": lambda r: 24, "ptDescRow": lambda r: 25, "id": "G", "name": "B", "img1": "E", "img2": "F"}
mb = mission_block(ws, 20, cols, 6, 3, 29, req=group("requirements", "Itens exigidos", req_slots, kind="requirements"))
mb["fields"].append(field("requirementsText", "Texto dos itens exigidos", "M21", "derived", req_fmt3))
layout(7, "doit-requirements", "doit", "Faça se Puder – com itens exigidos",
       "Uma missão de 24 horas com até 3 itens consumidos e até 6 recompensas.",
       [title(ws, "C2"), *dates(ws, "C5", "C6")],
       [sset("missions", "Missão", [mb], 1, "Missão")])

# ---------------------------------------------------------------- Desafio da Tribo
ws = wb.worksheets[8]
cols = {"en": "B", "pt": "G", "ptTitleRow": lambda r: 23, "ptDescRow": lambda r: 24, "id": "G", "name": "B", "img1": "E", "img2": "F"}
ch = choice_group("B", "E", "F", [43, 49, 55, 61], "G43")
mb = mission_block(ws, 21, cols, 5, 3, 26, choice=ch)
layout(8, "tribe", "tribe", "Desafio da Tribo",
       "Missão de 24 horas com 5 recompensas fixas e até 4 opções \"escolha um\".",
       [title(ws, "C2"), field("serverNote", "Aviso de servidor", "P3", "derived", fmt_from(ws, "P3", "servers")), *dates(ws, "C5", "C6")],
       [sset("missions", "Missão", [mb], 1, "Missão")],
       hideWhenEmpty=[{"set": "missions", "block": 0, "group": "choice", "rows": [41, 63]}])


# ---------------------------------------------------------------- Trocas (descoberta automática)
def merged_range(ws, ref):
    for m in ws.merged_cells.ranges:
        if ref in m:
            return m
    return None


def exchange_layout(idx, lid, label, description, notes=()):
    ws = wb.worksheets[idx]
    # moedas de troca: células com nome do item entre as linhas 8 e 16, colunas F
    coin_cells = [f"F{r}" for r in range(9, 16) if "[" in text(ws, f"F{r}")]
    id_cell = next(f"F{r}" for r in range(9, 18) if text(ws, f"F{r}").upper().startswith("ID:"))
    img_hdr = next(c.coordinate for c in ws[8] if str(c.value or "").strip().upper() == "IMAGE")
    img_col = rc(img_hdr)[0]
    img_end = L(CI(img_col) + (1 if merged_range(ws, img_hdr) and merged_range(ws, img_hdr).max_col > CI(img_col) else 0))
    if len(coin_cells) == 1 and "\n" in text(ws, coin_cells[0]).strip() and text(ws, coin_cells[0]).count("[") > 1:
        n = text(ws, coin_cells[0]).count("[Permanent]") + text(ws, coin_cells[0]).count("[30 Days")
        m = merged_range(ws, coin_cells[0])
        coin_slots = [item_slot(coin_cells[0], f"{img_col}{m.min_row}:{img_end}{m.max_row}") for _ in range(n)]
    else:
        coin_slots = []
        for c in coin_cells:
            m = merged_range(ws, c)
            coin_slots.append(item_slot(c, f"{img_col}{m.min_row}:{img_end}{m.max_row}"))
    coin_block = block([field("ids", "ID das moedas", id_cell, "derived", "ID: {idList:items}", "plain")],
                       [group("items", "Item de troca", coin_slots)])
    # grupos: linha de cabeçalho com "Value" / "ID / Value"
    hdrs = []
    for row in ws.iter_rows(min_row=10, max_row=ws.max_row):
        for c in row:
            if str(c.value or "").strip() in ("Value", "ID / Value"):
                hdrs.append(c.coordinate)
    groups_blocks = []
    for gi, h in enumerate(hdrs):
        vcol, hr = rc(h)
        hdr = {str(ws[f"{L(cc)}{hr}"].value or "").strip(): L(cc) for cc in range(CI(vcol), CI(vcol) + 12)}
        name_col = hdr["Item Name"]
        imgc = hdr["Image"]
        idc = hdr.get("ID / Amount") or hdr.get("ID/ Amount")
        condc = hdr["Condition"]
        totc = hdr["Total"]
        next_h = rc(hdrs[gi + 1])[1] if gi + 1 < len(hdrs) else ws.max_row + 1
        entries = []
        r = hr + 1
        while r < next_h - 1:
            v, nm = text(ws, f"{vcol}{r}"), text(ws, f"{name_col}{r}")
            if not (v or nm):
                r += 1
                continue
            mr = merged_range(ws, f"{name_col}{r}")
            end = mr.max_row if mr else r
            ids = [x for x in re.split(r",", text(ws, f"{idc}{r}")) if x.strip()]
            n = max(1, len(ids))
            if n == 1:
                slots = [item_slot(f"{name_col}{r}", f"{imgc}{r}:{imgc}{end}")]
            else:
                # imagens de um pacote: cada item ocupa uma faixa de linhas da entrada
                rows = list(range(r, end + 1))
                per = max(1, len(rows) // n)
                slots = []
                for j in range(n):
                    a = rows[min(j * per, len(rows) - 1)]
                    b = rows[min((j + 1) * per - 1, len(rows) - 1)] if j < n - 1 else end
                    slots.append(item_slot(f"{name_col}{r}", f"{imgc}{a}:{imgc}{b}"))
            entries.append(block(
                [field("value", "Custo", f"{vcol}{r}", "text", "{value}", "idLine"),
                 field("idLine", "ID / Quantidade", f"{idc}{r}", "derived", "{idLine:items}", "idLine"),
                 field("total", "Total", f"{totc}{r}", "text")],
                [group("items", "Itens recebidos", slots)],
                hide=[r, end]))
            r = end + 1
        title_row = hr - 1
        last = max(b["hideRows"][1] for b in entries)
        groups_blocks.append(block(
            [field("title", "Nome do grupo", f"{vcol}{title_row}", "text"),
             field("condition", "Condição", f"{condc}{hr + 1}", "text")],
            [], hide=[title_row, last + 1 if last + 1 < next_h - 1 else last],
            children={"key": "entries", "label": "Trocas", "blockLabel": "Troca", "minBlocks": 1, "blocks": entries}))
    ws_title = "F2"
    flds = [title(ws, ws_title), *dates(ws, "F5", "F6")]
    for k, (cell, lab) in enumerate(notes):
        flds.append(field(f"note{k + 1}", lab, cell, "textarea"))
    layout(idx, lid, "exchange", label, description, flds,
           [sset("coins", "Item de troca", [coin_block], 1, "Item de troca"),
            sset("groups", "Grupos", groups_blocks, 1, "Grupo")])


exchange_layout(10, "exchange-11groups", "Troca – até 11 grupos",
                "Item de troca único e até 11 grupos (A–K) com 4 trocas cada.",
                notes=[("M5", "Observação (quantidade obtida)")])
exchange_layout(11, "exchange-bundles", "Troca – pacotes de 3 itens",
                "Uma troca por pacote: cada troca entrega até 3 itens.")
exchange_layout(12, "exchange-multi-coin", "Troca – até 4 moedas",
                "Até 4 itens de troca e 4 grupos com custo combinado.")
exchange_layout(13, "exchange-two-coins", "Troca – 2 moedas, 4 grupos",
                "Dois itens de troca e até 4 grupos com 4 trocas.",
                notes=[("O10", "Observação (moeda)")])
exchange_layout(14, "exchange-pairs", "Troca – pares de itens",
                "Grupo A com trocas de 2 itens e grupo B com trocas simples.",
                notes=[("N17", "Observação do grupo A"), ("N28", "Observação 1 do grupo B"), ("N29", "Observação 2 do grupo B")])
exchange_layout(15, "exchange-two-coins-ss", "Troca – 2 moedas, grupos SS/S",
                "Dois itens de troca e grupos SS/S com custo combinado.")


# ---------------------------------------------------------------- Recarga / Consumo
def tiers_layout(idx, lid, type_, label, description, first, n, title_cell=None, date_cells=None, word="RECHARGE", helper=None):
    ws = wb.worksheets[idx]
    blocks = []
    for k in range(n):
        r = first + 3 * k
        blocks.append(block(
            [field("value", "Valor (cupons)", f"B{r}", "text", f"{word} OF {{value}} COUPONS", "tierLabel"),
             field("idLine", "ID / Quantidade", f"D{r}", "derived", "{idLine:items}", "idLine"),
             field("condition", "Condição", f"E{r}", "text", "{value}", "plain", ["Can be repeated", "Cannot be repeated"])],
            [group("items", "Itens", [item_slot(f"C{r + j}", f"{c}{r}:{c}{r + 2}") for j, c in enumerate("HIJ")], style="inline")],
            hide=[r, r + 2]))
    flds = []
    if title_cell:
        flds.append(title(ws, title_cell))
    if date_cells:
        flds += dates(ws, *date_cells)
    extra = {"clearRanges": helper} if helper else {}
    layout(idx, lid, type_, label, description, flds, [sset("tiers", "Faixas", blocks, 1, "Faixa")], **extra)


tiers_layout(16, "recharge-13", "recharge", "Recarga", "Até 13 faixas de recarga com 3 itens.", 5, 13,
             helper=["L5:R43"])
tiers_layout(17, "consume-10", "consume", "Consumo", "Até 10 faixas de consumo com 3 itens.", 5, 10, word="CONSUME",
             helper=["L5:R34"])
tiers_layout(18, "recharge-extra-5", "recharge_extra", "Recarga Extra", "Até 5 faixas de recarga extra.", 17, 5,
             title_cell="B3", date_cells=("B5", "B6"))
tiers_layout(19, "consume-extra-5", "consume_extra", "Consumo Extra", "Até 5 faixas de consumo extra.", 14, 5,
             title_cell="B5", date_cells=("B7", "B8"), word="CONSUME")


# ---------------------------------------------------------------- Rankings
def ranking_layout(idx, lid, type_, label, word):
    ws = wb.worksheets[idx]
    blocks = []
    for k in range(10):
        r = 9 + 4 * (k % 5)
        cols = ("I", "J", "K") if k < 5 else ("N", "O", "P")
        blocks.append(block(
            [field("idLine", "ID / Quantidade", f"{cols[0]}{r + 2}", "derived", "{idLine:items}", "idLine")],
            [group("items", "Itens", [item_slot(f"{c}{r + 1}", f"{c}{r}:{c}{r}") for c in cols])]))
    obs = text(ws, "B6")
    layout(idx, lid, type_, label, f"Até 10 posições com 3 itens ({word.lower()}).",
           [field("title", "Título", "E3", "derived", fmt_from(ws, "E3", "servers"), "rankingTitle"),
            field("minimum", "Mínimo para participar (cupons)", "B6", "text", re.sub(r"[\d.]+ COUPONS", "{value} COUPONS", obs)),
            field("start", "Data de entrada", "N5", "datetime", "{date}"),
            field("end", "Data de saída", "N6", "datetime", "{date}")],
           [sset("places", "Posições", blocks, 1, "Posição")])


ranking_layout(20, "ranking-consume", "ranking_consume", "Ranking de Consumo", "CONSUME")
ranking_layout(21, "ranking-recharge", "ranking_recharge", "Ranking de Recarga", "RECHARGE")

# ---------------------------------------------------------------- Solicitações manuais (Activity request)
# Abas trazidas da planilha "Cronograma Projetos" com scripts/event-template/merge_sheets.py.
STAMP_RE = re.compile(r"\s*s1\s*-\s*s?\d+\s*$")


request_layouts = []


def request_layout(sheet, lid, label, description, sets=(), extra_fields=()):
    if rwb is None:
        return
    ws = rwb[sheet]
    cells = [c for row in ws.iter_rows(max_row=25) for c in row if isinstance(c.value, str)]
    title_cell = next(c.coordinate for c in cells if c.row == 2)
    date_cells = [c.coordinate for c in cells if c.value.startswith("DATE ")]
    fields = [title(ws, title_cell)]
    for k in range(0, len(date_cells), 2):
        n = k // 2
        prefix = "" if n == 0 else f"p{n + 1}_"
        pair = dates(ws, date_cells[k], date_cells[k + 1], prefix)
        if n:
            for f in pair:
                f["label"] = f"{f['label']} ({n + 1}ª data)"
        fields += pair
    for c in cells:
        if STAMP_RE.match(c.value):
            fields.append(field("serversStamp", "Servidores (selo)", c.coordinate, "derived", "{servers}"))
    fields += list(extra_fields)
    layout(rwb.sheetnames.index(sheet), lid, "request", label, description, fields, list(sets), book=rwb, into=request_layouts)


SIMPLE_REQUESTS = [
    ("BR-Adventure Dungeon s1-s402", "request-adventure-dungeon", "Masmorra de Aventura (Adventure Dungeon)"),
    ("BR-Pop Full s1-s402", "request-dream-challenge", "Desafio dos Sonhos (Dream Challenge)"),
    ("BR-Good of Fortune s1-s402", "request-god-of-fortune", "Deus da Fortuna (Good of Fortune)"),
    ("BR-S.Shooting balloon s1-s402", "request-shooting-balloon", "Super Balão de Tiro (Super Shooting Balloon)"),
    ("BR-DD Destiny s1-s402", "request-dd-destiny", "DD Destino (DD Destiny)"),
    ("BR-Puzzle s1-s402", "request-puzzle", "Quebra-cabeça (Puzzle)"),
    ("BR-Chaos Insects s1-s402", "request-chaos-insects", "Caça aos Insetos (Chaos Insects)"),
    ("BR-Lottery s1-s402", "request-lottery", "Loteria (Lottery)"),
    ("BR-Nebula Battle s1-s402", "request-nebula-battle", "Batalha Nebulosa (Nebula Battle)"),
    ("BR-Minefield s1-s402", "request-minefield", "Campo Minado (Minefield)"),
    ("BR-Romantic Trip s1-s402", "request-romantic-trip", "Viagem Romântica (Romantic Trip)"),
    ("BR-Who's the Boss s1-s402", "request-whos-the-boss", "Quem é o Chefe? (Who's the Boss)"),
    ("BR-Bouquet s1-s402", "request-bouquet", "Buquê (Bouquet)"),
    ("BR-Perfect Couple s1-s402", "request-perfect-couple", "Casal Perfeito (Perfect Couple)"),
    ("BR-Adq. Sacred Card s1-s402", "request-sacred-card", "Adq. Cartão Sagrado (Adq. Sacred Card)"),
    ("BR-Squad s1-s402", "request-special-squad", "Esquadrão Especial (Special Squad)"),
    ("BR-Treasure Maze s1-s402", "request-treasure-maze", "Labirinto do Tesouro (Treasure Maze)"),
]
for sheet, lid, label in SIMPLE_REQUESTS:
    request_layout(sheet, lid, label, "Pedido de inclusão da atividade: datas e servidores.")

request_layout("BR-First Elimination s1-s402", "request-master-elimination", "Mestre de Eliminação (Master of Elimination)",
               "Pedido de inclusão com três períodos (datas e servidores).")

# Tesouro do Diabo: um item de prêmio.
request_layout("BR-The devil's treasure s1-s402", "request-devils-treasure", "Tesouro do Diabo (The Devil's Treasure)",
               "Pedido de inclusão com o item de prêmio da atividade.",
               [sset("prize", "Prêmio", [block([], [group("items", "Item", [
                   item_slot("F21", "I21:J21", [{"cell": "K21", "format": "{id}", "rich": "plain"}])])])], 1, "Prêmio")])

# Desvende a Instância: até 3 prêmios com ID*quantidade.
request_layout("BR-Uncover The Instance s1-s402", "request-uncover-instance", "Desvende a Instância (Uncover the Instance)",
               "Pedido de inclusão com até 3 prêmios (os 300 primeiros por dia).",
               [sset("prizes", "Prêmios", [block([], [group("items", "Itens", [
                   item_slot(f"D{r}", f"G{r}:H{r}", [{"cell": f"I{r}", "format": "{idAmount}", "rich": "idLine"}], hide=[r, r])
                   for r in (30, 31, 32)])])], 1, "Lista")])

# Capturar Nien: 5 baús com até 5 itens cada e a linha de IDs.
nien_blocks = [block(
    [{**field("label", "Baú (nome e meta)", f"C{r}", "textarea"), "default": text(rwb["BR-Capture Nien s1-s402"], f"C{r}") if rwb else ""},
     field("idLine", "ID / Quantidade", f"D{r + 2}", "derived", "{idLine:items}", "idLine")],
    [group("items", "Itens", [item_slot(f"{c}{r}") for c in "DFHJL"])],
    hide=[r - 1, r + 2],  # a imagem do baú fica na linha acima do nome
) for r in (16, 20, 24, 28, 32)]
request_layout("BR-Capture Nien s1-s402", "request-capture-nien", "Capturar Nien (Capture Nien)",
               "Pedido de inclusão com até 5 baús de prêmio, 5 itens em cada.",
               [sset("chests", "Baús", nien_blocks, 1, "Baú")])


# ---------------------------------------------------------------- fundo por validade
# No modelo, a célula do nome de itens com validade em dias costuma ter fundo colorido
# e a de itens permanentes não. Registramos o fillId mais usado em cada caso, por aba.
import collections, zipfile
from xml.etree import ElementTree as ET

M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
zf = zipfile.ZipFile(SRC)
styles = ET.fromstring(zf.read("xl/styles.xml"))
xf_fill = [int(x.get("fillId", "0")) for x in styles.find(f"{M}cellXfs")]
wbx = ET.fromstring(zf.read("xl/workbook.xml"))
wrels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
rel_target = {r.get("Id"): r.get("Target") for r in wrels}
sheet_path = {sh.get("name"): "xl/" + rel_target[sh.get(f"{R}id")].lstrip("/").replace("xl/", "") for sh in wbx.find(f"{M}sheets")}


def cell_styles(path):
    root = ET.fromstring(zf.read(path))
    return {c.get("r"): int(c.get("s", "0")) for c in root.iter(f"{M}c")}


def name_cells(blocks):
    for b in blocks:
        for g in b["groups"]:
            if g["kind"] != "items":
                continue
            for slot in g["slots"]:
                yield slot["cells"][0]["cell"]
        if b.get("children"):
            yield from name_cells(b["children"]["blocks"])


for lay in layouts:
    ws = wb[lay["sheet"]]
    st = cell_styles(sheet_path[lay["sheet"]])
    counts = {"timed": collections.Counter(), "permanent": collections.Counter()}
    for set_ in lay["sets"]:
        for ref in name_cells(set_["blocks"]):
            v = ws[ref].value
            if not isinstance(v, str) or "[" not in v:
                continue
            kind = "timed" if re.search(r"\d+\s*Days?", v) else "permanent"
            counts[kind][xf_fill[st.get(ref, 0)]] += 1
    if counts["timed"] and counts["permanent"]:
        timed = counts["timed"].most_common(1)[0][0]
        perm = counts["permanent"].most_common(1)[0][0]
        if timed != perm:
            lay["durationFill"] = {"timed": timed, "permanent": perm}

layouts.sort(key=lambda lay: wb.sheetnames.index(lay["sheet"]))  # mesma ordem das abas do modelo
digest = hashlib.sha256(open(SRC, "rb").read()).hexdigest()
manifest = {"version": VERSION, "sha256": digest, "fileName": FILE_NAME,
            "coverLayout": "daily-14d", "layouts": layouts}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(manifest, f, ensure_ascii=False, separators=(",", ":"))
print(f"{len(layouts)} layouts -> {OUT} ({digest[:12]})")

if REQ:
    request_layouts.sort(key=lambda lay: rwb.sheetnames.index(lay["sheet"]))
    req_digest = hashlib.sha256(open(REQ, "rb").read()).hexdigest()
    req_manifest = {"version": REQ_VERSION, "sha256": req_digest, "fileName": REQ_FILE_NAME,
                    # O arquivo de solicitações carrega os estilos e textos deste modelo (mesmos índices).
                    "baseSha256": digest, "layouts": request_layouts}
    with open(REQ_OUT, "w", encoding="utf-8") as f:
        json.dump(req_manifest, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(request_layouts)} solicitações -> {REQ_OUT} ({req_digest[:12]})")
