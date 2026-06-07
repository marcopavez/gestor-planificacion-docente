"""Extrae los Objetivos de Aprendizaje de las Bases Curriculares 1º-6º (MINEDUC)
a JSON por asignatura/nivel. Extracción fiel por coordenadas (pdfplumber).

NO inventa contenido: el texto del OA es el del PDF (de-guionado al unir líneas).
Los códigos (p. ej. MA01 OA 01) se reconstruyen con la convención de
curriculumnacional.cl (prefijo de asignatura + nivel + número); el prefijo va
marcado para verificar salvo Matemática (validado contra el corpus oráculo).
"""
import json, re, sys, unicodedata
from collections import defaultdict
import pdfplumber

PDF = "docs/bases-curriculares-primera-a-sexto-basico.pdf"

SUBJECTS = {
    "Artes Visuales": "AR",
    "Ciencias Naturales": "CN",
    "Educación Física y Salud": "EF",
    "Historia, Geografía y Ciencias Sociales": "HI",
    "Tecnología": "TE",
    "Matemática": "MA",
    "Idioma Extranjero Inglés": "IN",
    "Lenguaje y Comunicación": "LE",
    "Música": "MU",
    "Orientación": "OR",
}
NIVEL_TXT = {n: f"{n}º básico" for n in range(1, 7)}

EJE_MAX_X = 150      # columna izquierda = eje
NUM_MAX_X = 195      # número de OA (alineado a la derecha ~196); texto empieza >=195
LINE_TOL = 4
EJE_MERGE_GAP = 40
# nota: NO se filtra "Habilidad" aquí — en Ed. Física el eje se llama "Habilidades
# motrices"; las secciones vecinas (Habilidades/Actitudes) se limpian luego porque
# nunca quedan asignadas a un OA.
HEADER_RE = re.compile(r"Objetivos|Aprendizaje|Ejes|estudiantes|capaces|serán")
STOP_RE = re.compile(r"Habilidad|Actitud")   # secciones que vienen tras los OA
# divisores de nivel y de asignatura: texto rotado/invertido en las páginas separadoras
# ("Primero Básico" -> "oremirP ocisáB"; "Ciencias Naturales" -> "saicneiC selarutaN").
# Marcan el fin del bloque (evitan que el último OA absorba la intro de la sección vecina).
DIVIDER_MARKS = {"oremirP", "odnugeS", "orecreT", "otrauC", "otniuQ", "otxeS", "ocisáB",
                 "setrA", "saicneiC", "nóicacudE", "airotsiH", "aígolonceT", "acitámetaM",
                 "amoidI", "ejaugneL", "acisúM", "nóicatneirO"}
# palabras de una letra válidas en español (no son viñetas)
ONE_LETTER_WORDS = {"y", "o", "a", "e", "u", "i"}


def is_bullet(t):
    t = t.strip()
    return len(t) == 1 and not t.isdigit() and t.lower() not in ONE_LETTER_WORDS


def lines_of(page):
    words = [w for w in page.extract_words() if w["text"].strip()]
    words.sort(key=lambda w: (round(w["top"]), w["x0"]))
    lines = []
    for w in words:
        if lines and abs(w["top"] - lines[-1]["top"]) <= LINE_TOL:
            lines[-1]["tokens"].append((w["x0"], w["x1"], w["text"]))
            lines[-1]["top"] = min(lines[-1]["top"], w["top"])
        else:
            lines.append({"top": w["top"], "tokens": [(w["x0"], w["x1"], w["text"])]})
    for ln in lines:
        ln["tokens"].sort(key=lambda t: t[0])
    return lines


def dehyph(acc, nxt):
    if not acc:
        return nxt
    if acc.endswith("-"):
        return acc[:-1] + nxt
    return acc + " " + nxt


def page_ejes(lines, eje_max):
    """Etiquetas de eje (columna izq. de `eje_max`), filtrando encabezados y
    fusionando fragmentos contiguos. Devuelve [(start_top, texto_normalizado)]."""
    frags = []
    for ln in lines:
        if ln["top"] < 60:
            continue
        left = [t for x0, x1, t in ln["tokens"] if x0 < eje_max]
        if not left:
            continue
        txt = " ".join(left).strip()
        if not txt or txt.isdigit() or HEADER_RE.search(txt):
            continue
        frags.append([ln["top"], txt])
    merged = []
    for top, txt in frags:
        if merged and top - merged[-1][2] <= EJE_MERGE_GAP:
            merged[-1][1] = (merged[-1][1] + " " + txt).strip()
            merged[-1][2] = top
        else:
            merged.append([top, txt, top])
    return [(m[0], _norm_eje(m[1])) for m in merged]


def _norm_eje(s):
    s = s.strip()
    return s[:1].upper() + s[1:].lower() if s else s


def _is_stop(ln):
    full = [t for _, _, t in ln["tokens"]]
    left_txt = " ".join(t for x0, x1, t in ln["tokens"] if x0 < EJE_MAX_X)
    is_divider = any(m in t for t in full for m in DIVIDER_MARKS)
    return (is_divider or STOP_RE.search(left_txt)
            or re.search(r"Glosario|Bibliograf", " ".join(full)))


def _oa_number(tokens, expected):
    """Si la línea contiene el número de OA esperado (dígito puro con texto a su
    derecha), devuelve (x0, x1) del número; si no, None. Detección por VALOR
    (no por posición), robusta a anchos de columna variables."""
    toks = sorted(tokens)
    for i, (x0, x1, t) in enumerate(toks):
        if t.strip().isdigit() and int(t.strip()) == expected and any(o > x1 for o, _, _ in toks):
            return x0, x1
    return None


def parse_block(pages):
    # PASS 1: recolectar líneas activas (cortando secciones posteriores a los OA,
    # pero solo una vez iniciados los OA) y las posiciones x de los números de OA.
    cached = []
    num_x0s = []
    exp = 1
    started = False
    done = False
    for page in pages:
        if done:
            break
        active = []
        for ln in lines_of(page):
            if ln["top"] < 60:
                continue
            nx = _oa_number(ln["tokens"], exp)
            if nx:                 # la línea trae el OA esperado -> es OA, nunca un corte
                active.append(ln)
                num_x0s.append(nx[0])
                exp += 1
                started = True
            elif _is_stop(ln) and started:   # corte real tras los OA (Habilid./Actitud./Glosario/divisor)
                done = True
                break
            else:
                active.append(ln)            # eje, continuación o relleno previo
        cached.append(active)
    eje_max = (min(num_x0s) - 5) if num_x0s else EJE_MAX_X

    # PASS 2: ensamblar usando el límite de columna adaptativo `eje_max`.
    oas, ejes_order, expected, last_eje, cur = [], [], 1, None, None
    for active in cached:
        pejes = page_ejes(active, eje_max)
        for _, t in pejes:
            if t not in ejes_order:
                ejes_order.append(t)

        def eje_for(top):
            chosen = None
            for start, txt in pejes:
                if start <= top + LINE_TOL:
                    chosen = txt
                else:
                    break
            return chosen

        for ln in active:
            content = sorted((x0, x1, t) for x0, x1, t in ln["tokens"] if x0 >= eje_max)
            if not content:
                continue
            nx = _oa_number(content, expected)
            if nx:
                rest = [(ln["top"], x0, t) for x0, x1, t in content if x0 > nx[1]]
                if rest:
                    cur = {"numero": expected, "eje": eje_for(ln["top"]) or last_eje,
                           "base_x": min(x for _, x, _ in rest), "raw": list(rest)}
                    last_eje = cur["eje"]
                    oas.append(cur)
                    expected += 1
            elif cur is not None:
                cur["raw"].extend((ln["top"], x0, t) for x0, x1, t in content)
    # los ejes reales son solo los asignados a algún OA (descarta etiquetas de
    # secciones vecinas como Habilidades, que nunca se asignan a un OA)
    seen = []
    for oa in oas:
        if oa["eje"] and oa["eje"] not in seen:
            seen.append(oa["eje"])
    return oas, seen


def assemble(raw, base_x):
    bullets = [top for top, x, t in raw if is_bullet(t)]
    content = [(top, x, t) for top, x, t in raw if not is_bullet(t)]
    content.sort(key=lambda r: (round(r[0]), r[1]))
    lines = []
    for top, x, t in content:
        if lines and abs(top - lines[-1]["top"]) <= LINE_TOL:
            lines[-1]["toks"].append((x, t))
            lines[-1]["top"] = min(lines[-1]["top"], top)
        else:
            lines.append({"top": top, "toks": [(x, t)]})
    main, detalle, cur = [], [], None
    for ln in lines:
        ln["toks"].sort()
        minx = ln["toks"][0][0]
        text = " ".join(t for _, t in ln["toks"]).strip()
        if minx >= base_x + 5:        # detalle (sub-viñeta)
            has_bullet = any(ln["top"] - 1 <= b <= ln["top"] + 7 for b in bullets)
            if cur is None or has_bullet:
                if cur is not None:
                    detalle.append(cur)
                cur = text
            else:
                cur = dehyph(cur, text)
        else:                         # texto principal
            if cur is not None:
                detalle.append(cur)
                cur = None
            main.append(text)
    if cur is not None:
        detalle.append(cur)
    desc = ""
    for p in main:
        desc = dehyph(desc, p)
    return desc.strip(), detalle


def detect_blocks(pdf):
    names = sorted(SUBJECTS, key=len, reverse=True)
    pat = re.compile(r"(" + "|".join(re.escape(n) for n in names) +
                     r")\s+(\d)\s*[º°]\s*[Bb]ásico")
    found = []
    for i, page in enumerate(pdf.pages):
        m = pat.search((page.extract_text() or "")[:140])
        if m:
            found.append((m.group(1), int(m.group(2)), i))
    collapsed = []
    for subj, niv, idx in found:
        if collapsed and collapsed[-1][0] == subj and collapsed[-1][1] == niv:
            continue
        collapsed.append((subj, niv, idx))
    return collapsed


def _slug(subj):
    s = unicodedata.normalize("NFKD", subj).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", "-", s.lower().replace(",", "").strip())


def build_doc(subj, niv, pages):
    oas, ejes = parse_block(pages)
    prefix = SUBJECTS[subj]
    objetivos = []
    for oa in oas:
        desc, det = assemble(oa["raw"], oa["base_x"])
        item = {"codigo": f"{prefix}{niv:02d} OA {oa['numero']:02d}", "numero": oa["numero"],
                "eje": oa["eje"], "descripcion": desc, "indicadores": []}
        if det:
            item["detalle"] = det
        # marca honesta de extracción dudosa (layout complejo: 2 columnas / notas)
        if not desc or desc[0].islower() or len(desc) < 12:
            item["revision"] = "[VERIFICAR: extracción dudosa; revisar contra el PDF]"
        objetivos.append(item)
    return {
        "asignatura": subj, "nivel": NIVEL_TXT[niv],
        "codigoAsignaturaNivel": f"{prefix}{niv:02d}",
        "fuente": {
            "documento": "Bases Curriculares 1º a 6º Básico (MINEDUC)",
            "pdf": PDF,
            "verificado": ("Matemática: validado vs corpus oráculo." if prefix == "MA"
                           else "[VERIFICAR] prefijo de código según convención curriculumnacional.cl; texto del OA tomado del PDF."),
        },
        "vigencia": {"desde": None, "hasta": None,
                     "nota": "[VERIFICAR] decreto y fecha que aprueban estas Bases."},
        "ejes": ejes,
        "objetivos_aprendizaje": objetivos,
    }


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    with pdfplumber.open(PDF) as pdf:
        blocks = detect_blocks(pdf)
        ranges = []
        for k, (subj, niv, label) in enumerate(blocks):
            # el contenido puede empezar en la página par anterior al rótulo (spread)
            start = max(0, label - 1)
            end = blocks[k + 1][2] if k + 1 < len(blocks) else label + 5
            ranges.append((subj, niv, start, min(end, label + 6)))
        if only == "--map":
            for subj, niv, s, e in ranges:
                print(f"{subj} {niv}: pdf {s+1}-{e}")
            return
        manifest = []
        for subj, niv, start, end in ranges:
            if only and only != f"{subj}:{niv}":
                continue
            pages = [pdf.pages[i] for i in range(start, min(end, len(pdf.pages)))]
            doc = build_doc(subj, niv, pages)
            n = len(doc["objetivos_aprendizaje"])
            if only and ":" in only:
                print(json.dumps(doc, ensure_ascii=False, indent=2))
            else:
                fname = f"{_slug(subj)}-{niv}-basico.json"
                with open(f"corpus/curriculum/{fname}", "w", encoding="utf-8") as f:
                    json.dump(doc, f, ensure_ascii=False, indent=2)
                manifest.append({"asignatura": subj, "nivel": NIVEL_TXT[niv],
                                 "archivo": fname, "oa": n})
                print(f"wrote {fname}: {n} OA, ejes={len(doc['ejes'])}")
        if not only:
            with open("corpus/curriculum/_manifest.json", "w", encoding="utf-8") as f:
                json.dump({"documento": "Bases Curriculares 1º a 6º Básico (MINEDUC)",
                           "fuentePdf": PDF, "bloques": manifest}, f, ensure_ascii=False, indent=2)
            print(f"\nmanifest: {len(manifest)} bloques, {sum(b['oa'] for b in manifest)} OA total")


if __name__ == "__main__":
    main()
