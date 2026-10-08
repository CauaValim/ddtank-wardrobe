"""
Copia abas de outra planilha para o modelo oficial, mantendo formatação, mesclagens e imagens.

    python scripts/event-template/merge_sheets.py modelo.xlsx origem.xlsx saida.xlsx "Aba 1" "Aba 2" ...

Usado para trazer as abas de "Solicitação manual" (Activity request) para o modelo de eventos.
As duas planilhas usam temas de cor diferentes, então as cores de tema das abas copiadas
(células, textos e caixas de texto) viram cores fixas, para ficarem iguais à origem.
Requer lxml (pip install lxml).
"""
import colorsys
import copy
import posixpath
import re
import sys
import zipfile

from lxml import etree

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
    "ct": "http://schemas.openxmlformats.org/package/2006/content-types",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
}
M = "{%s}" % NS["m"]
R_ID = "{%s}id" % NS["r"]
WORKSHEET_CT = "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"
DRAWING_CT = "application/vnd.openxmlformats-officedocument.drawing+xml"
SHEET_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"
DRAWING_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing"
MEDIA_TYPES = {"png": "image/png", "jpeg": "image/jpeg", "jpg": "image/jpeg", "gif": "image/gif", "emf": "image/x-emf", "wmf": "image/x-wmf",
               "wdp": "image/vnd.ms-photo", "svg": "image/svg+xml", "bmp": "image/bmp", "tiff": "image/tiff"}


def xml(data):
    return etree.fromstring(data)


def dump(root):
    return etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)


class Package:
    def __init__(self, path):
        with zipfile.ZipFile(path) as z:
            self.files = {n: z.read(n) for n in z.namelist()}
            self.order = z.namelist()

    def save(self, path):
        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
            for n in self.order:
                z.writestr(n, self.files[n])

    def put(self, name, data):
        if name not in self.files:
            self.order.append(name)
        self.files[name] = data

    def unique(self, pattern):
        n = 1
        while pattern.format(n) in self.files:
            n += 1
        return pattern.format(n)

    def rels_path(self, part):
        d, f = posixpath.split(part)
        return posixpath.join(d, "_rels", f + ".rels")

    def rels(self, part):
        p = self.rels_path(part)
        return xml(self.files[p]) if p in self.files else etree.Element("{%s}Relationships" % NS["rel"], nsmap={None: NS["rel"]})

    def sheets(self):
        wb = xml(self.files["xl/workbook.xml"])
        rels = {r.get("Id"): r.get("Target") for r in self.rels("xl/workbook.xml")}
        out = {}
        for s in wb.iter(M + "sheet"):
            t = rels[s.get(R_ID)]
            out[s.get("name")] = t.lstrip("/") if t.startswith("/") else posixpath.normpath(posixpath.join("xl", t))
        return out


# ------------------------------------------------------------------ cores

THEME_ORDER = ["lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"]
SCHEME_ALIAS = {"bg1": "lt1", "tx1": "dk1", "bg2": "lt2", "tx2": "dk2"}


def theme_colors(pkg):
    theme = xml(pkg.files["xl/theme/theme1.xml"])
    scheme = theme.find(".//a:clrScheme", NS)
    out = {}
    for el in scheme:
        name = etree.QName(el).localname
        c = el[0]
        out[name] = (c.get("lastClr") if etree.QName(c).localname == "sysClr" else c.get("val")).upper()
    return out


def adjust(hex_rgb, lum_mod=1.0, lum_off=0.0, tint=None):
    r, g, b = (int(hex_rgb[i:i + 2], 16) / 255 for i in (0, 2, 4))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    if tint is not None:
        l = l * (1 + tint) if tint < 0 else l * (1 - tint) + tint
    l = min(1.0, max(0.0, l * lum_mod + lum_off))
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return "".join(f"{round(v * 255):02X}" for v in (r, g, b))


def resolve_cell_colors(el, colors):
    """<color theme="4" tint="0.4"/> -> <color rgb="FF......"/> em fontes, preenchimentos, bordas e textos."""
    for c in el.iter():
        if c.get("theme") is None or not isinstance(c.tag, str):
            continue
        idx = int(c.get("theme"))
        base = colors[THEME_ORDER[idx]] if idx < len(THEME_ORDER) else "000000"
        tint = float(c.get("tint")) if c.get("tint") else None
        rgb = adjust(base, tint=tint) if tint else base
        for k in ("theme", "tint"):
            c.attrib.pop(k, None)
        c.set("rgb", "FF" + rgb)


def resolve_drawing_colors(root, colors):
    for sc in list(root.iter("{%s}schemeClr" % NS["a"])):
        name = SCHEME_ALIAS.get(sc.get("val"), sc.get("val"))
        if name not in colors:  # phClr etc.
            continue
        lum_mod = lum_off = None
        keep = []
        for mod in sc:
            ln = etree.QName(mod).localname
            v = int(mod.get("val")) / 100000
            if ln == "lumMod":
                lum_mod = v
            elif ln == "lumOff":
                lum_off = v
            elif ln == "shade":
                lum_mod = (lum_mod or 1.0) * v
            elif ln == "tint":
                lum_mod, lum_off = (lum_mod or 1.0) * v, (lum_off or 0.0) + (1 - v)
            else:
                keep.append(mod)
        rgb = adjust(colors[name], lum_mod if lum_mod is not None else 1.0, lum_off or 0.0)
        new = etree.Element("{%s}srgbClr" % NS["a"], val=rgb)
        for k in keep:
            new.append(k)
        sc.getparent().replace(sc, new)


# ------------------------------------------------------------------ estilos


class StyleMerger:
    def __init__(self, dst_pkg, src_pkg):
        self.dst = xml(dst_pkg.files["xl/styles.xml"])
        self.src = xml(src_pkg.files["xl/styles.xml"])
        self.colors = theme_colors(src_pkg)
        self.maps = {"font": {}, "fill": {}, "border": {}, "numFmt": {}, "xf": {}}
        self.seen = {k: {} for k in ("font", "fill", "border")}
        for kind, tag in (("font", "fonts"), ("fill", "fills"), ("border", "borders")):
            for i, el in enumerate(self.dst.find(M + tag)):
                self.seen[kind].setdefault(etree.tostring(el), i)

    def _copy_list_item(self, kind, tag, idx):
        if idx in self.maps[kind]:
            return self.maps[kind][idx]
        el = copy.deepcopy(self.src.find(M + tag)[idx])
        resolve_cell_colors(el, self.colors)
        if kind == "font":  # sem esquema de tema: usa o nome da fonte
            for sch in el.findall(M + "scheme"):
                el.remove(sch)
        key = etree.tostring(el)
        if key not in self.seen[kind]:
            parent = self.dst.find(M + tag)
            parent.append(el)
            parent.set("count", str(len(parent)))
            self.seen[kind][key] = len(parent) - 1
        self.maps[kind][idx] = self.seen[kind][key]
        return self.maps[kind][idx]

    def _num_fmt(self, fid):
        if fid < 164:
            return fid
        if fid in self.maps["numFmt"]:
            return self.maps["numFmt"][fid]
        src = next(n for n in self.src.find(M + "numFmts") if int(n.get("numFmtId")) == fid)
        dst = self.dst.find(M + "numFmts")
        if dst is None:
            dst = etree.Element(M + "numFmts")
            self.dst.insert(0, dst)
        for n in dst:
            if n.get("formatCode") == src.get("formatCode"):
                self.maps["numFmt"][fid] = int(n.get("numFmtId"))
                return self.maps["numFmt"][fid]
        new_id = max([163] + [int(n.get("numFmtId")) for n in dst]) + 1
        etree.SubElement(dst, M + "numFmt", numFmtId=str(new_id), formatCode=src.get("formatCode"))
        dst.set("count", str(len(dst)))
        self.maps["numFmt"][fid] = new_id
        return new_id

    def xf(self, idx):
        if idx in self.maps["xf"]:
            return self.maps["xf"][idx]
        el = copy.deepcopy(self.src.find(M + "cellXfs")[idx])
        el.set("fontId", str(self._copy_list_item("font", "fonts", int(el.get("fontId", 0)))))
        el.set("fillId", str(self._copy_list_item("fill", "fills", int(el.get("fillId", 0)))))
        el.set("borderId", str(self._copy_list_item("border", "borders", int(el.get("borderId", 0)))))
        el.set("numFmtId", str(self._num_fmt(int(el.get("numFmtId", 0)))))
        el.set("xfId", "0")
        xfs = self.dst.find(M + "cellXfs")
        xfs.append(el)
        xfs.set("count", str(len(xfs)))
        self.maps["xf"][idx] = len(xfs) - 1
        return self.maps["xf"][idx]


# ------------------------------------------------------------------ cópia


def merge(dst_path, src_path, out_path, names):
    dst, src = Package(dst_path), Package(src_path)
    styles = StyleMerger(dst, src)
    src_sheets = src.sheets()
    existing = set(dst.sheets())

    src_sst = xml(src.files["xl/sharedStrings.xml"])
    dst_sst = xml(dst.files["xl/sharedStrings.xml"])
    sst_map = {}

    def string(idx):
        if idx not in sst_map:
            si = copy.deepcopy(src_sst[idx])
            resolve_cell_colors(si, styles.colors)
            for sch in si.iter(M + "scheme"):
                sch.getparent().remove(sch)
            dst_sst.append(si)
            sst_map[idx] = len(dst_sst) - 1
        return sst_map[idx]

    wb = xml(dst.files["xl/workbook.xml"])
    wb_rels = dst.rels("xl/workbook.xml")
    ct = xml(dst.files["[Content_Types].xml"])
    defaults = {d.get("Extension").lower() for d in ct.findall("{%s}Default" % NS["ct"])}
    sheets_el = wb.find(M + "sheets")
    next_sheet_id = max(int(s.get("sheetId")) for s in sheets_el) + 1
    copied = []

    for name in names:
        if name in existing:
            print(f"pulando (já existe no modelo): {name}")
            continue
        part = src_sheets[name]
        ws = xml(src.files[part])
        for c in ws.iter(M + "c"):
            if c.get("s") is not None:
                c.set("s", str(styles.xf(int(c.get("s")))))
            if c.get("t") == "s":
                v = c.find(M + "v")
                v.text = str(string(int(v.text)))
        for row in ws.iter(M + "row"):
            if row.get("s") is not None:
                row.set("s", str(styles.xf(int(row.get("s")))))
        for col in ws.iter(M + "col"):
            if col.get("style") is not None:
                col.set("style", str(styles.xf(int(col.get("style")))))
        for sv in ws.iter(M + "sheetView"):
            sv.attrib.pop("tabSelected", None)
        for ps in ws.iter(M + "pageSetup"):
            ps.attrib.pop(R_ID, None)
        for tag in ("legacyDrawing", "controls", "oleObjects", "picture"):
            for el in ws.findall(M + tag):
                ws.remove(el)

        new_part = dst.unique("xl/worksheets/sheet{}.xml")
        sheet_rels = etree.Element("{%s}Relationships" % NS["rel"], nsmap={None: NS["rel"]})
        src_rels = {r.get("Id"): r for r in src.rels(part)}
        drawing_el = ws.find(M + "drawing")
        if drawing_el is not None:
            src_drawing = posixpath.normpath(posixpath.join(posixpath.dirname(part), src_rels[drawing_el.get(R_ID)].get("Target")))
            new_drawing = dst.unique("xl/drawings/drawing{}.xml")
            d_root = xml(src.files[src_drawing])
            resolve_drawing_colors(d_root, styles.colors)
            d_rels = etree.Element("{%s}Relationships" % NS["rel"], nsmap={None: NS["rel"]})
            for r in src.rels(src_drawing):
                if r.get("TargetMode") == "External":
                    d_rels.append(copy.deepcopy(r))
                    continue
                media = posixpath.normpath(posixpath.join(posixpath.dirname(src_drawing), r.get("Target")))
                ext = media.rsplit(".", 1)[-1].lower()
                new_media = dst.unique("xl/media/request{}." + ext)
                dst.put(new_media, src.files[media])
                if ext not in defaults:
                    etree.SubElement(ct, "{%s}Default" % NS["ct"], Extension=ext, ContentType=MEDIA_TYPES.get(ext, "application/octet-stream"))
                    defaults.add(ext)
                etree.SubElement(d_rels, "{%s}Relationship" % NS["rel"], Id=r.get("Id"), Type=r.get("Type"), Target="../media/" + posixpath.basename(new_media))
            dst.put(new_drawing, dump(d_root))
            dst.put(dst.rels_path(new_drawing), dump(d_rels))
            etree.SubElement(ct, "{%s}Override" % NS["ct"], PartName="/" + new_drawing, ContentType=DRAWING_CT)
            etree.SubElement(sheet_rels, "{%s}Relationship" % NS["rel"], Id="rId1", Type=DRAWING_REL, Target="../drawings/" + posixpath.basename(new_drawing))
            drawing_el.set(R_ID, "rId1")
            # drawing deve vir depois de pageSetup no XML da planilha; já está na ordem da origem.

        dst.put(new_part, dump(ws))
        if len(sheet_rels):
            dst.put(dst.rels_path(new_part), dump(sheet_rels))
        etree.SubElement(ct, "{%s}Override" % NS["ct"], PartName="/" + new_part, ContentType=WORKSHEET_CT)
        rid = "rIdReq%d" % next_sheet_id
        etree.SubElement(wb_rels, "{%s}Relationship" % NS["rel"], Id=rid, Type=SHEET_REL, Target="worksheets/" + posixpath.basename(new_part))
        s = etree.SubElement(sheets_el, M + "sheet", name=name, sheetId=str(next_sheet_id))
        s.set(R_ID, rid)
        next_sheet_id += 1
        copied.append(name)

    dst_sst.set("uniqueCount", str(len(dst_sst)))
    dst_sst.attrib.pop("count", None)
    dst.put("xl/sharedStrings.xml", dump(dst_sst))
    dst.put("xl/styles.xml", dump(styles.dst))
    dst.put("xl/workbook.xml", dump(wb))
    dst.put(dst.rels_path("xl/workbook.xml"), dump(wb_rels))
    dst.put("[Content_Types].xml", dump(ct))
    dst.save(out_path)
    print(f"{len(copied)} abas copiadas -> {out_path}")


if __name__ == "__main__":
    if len(sys.argv) < 5:
        sys.exit(__doc__)
    merge(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:])
