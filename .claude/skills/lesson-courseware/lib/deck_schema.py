# -*- coding: utf-8 -*-
"""课件 JSON 契约数据模型与确定性检查 (deck_schema)。

分层:
  ENVELOPE_SCHEMA  —— jsonschema 层:顶层信封结构与字段枚举 (Tier 1)
  SLIDE_REQUIREMENTS —— 每种幻灯片类型的必填/可选字段与备注要求 (Tier 1)
  FIGURE_REQUIREMENTS —— 声明式图元的参数契约 (Tier 1)
  check_deck()     —— 语义检查:课时归属/知识点白名单/数域上界/溯源 (Tier 2/3)

所有检查返回 issues 列表,每条 {code, severity(error|warning), slide_id?, message, hint?}。
error 一票否决;warning 仅提示,不拦截渲染。
"""

import re

# ---------------------------------------------------------------- 信封 Schema
ENVELOPE_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "Courseware Deck",
    "type": "object",
    "required": ["deck_id", "metadata", "curriculum_evidence", "slides"],
    "additionalProperties": False,
    "properties": {
        "deck_id": {
            "type": "string",
            "pattern": r"^cw-(math|chinese|english)-g[1-6]-t[12]-u\d+-(l\d+|lall)$",
            "description": "cw-学科-g年级-t册次-u单元-l课时",
        },
        "metadata": {
            "type": "object",
            "required": ["title", "subject", "grade", "term", "unit_id", "unit_name"],
            "additionalProperties": False,
            "properties": {
                "title": {"type": "string", "minLength": 2, "maxLength": 60},
                "subtitle": {"type": "string", "maxLength": 80},
                "subject": {"enum": ["math", "chinese", "english"]},
                "grade": {"type": "integer", "minimum": 1, "maximum": 6},
                "term": {"enum": ["term-1", "term-2"]},
                "unit_id": {"type": "string", "pattern": r"^unit-0?\d+$"},
                "unit_name": {"type": "string"},
                "lesson_id": {"type": "string"},
                "lesson_name": {"type": "string"},
                "class_period_label": {"type": "string", "description": "如 '第1课时' / '第5课'"},
                "teacher_name": {"type": "string"},
                "school": {"type": "string"},
                "style": {"enum": ["standard", "innovative"]},
            },
        },
        "curriculum_evidence": {
            "type": "object",
            "required": ["curriculum_status", "evidence_summary"],
            "additionalProperties": False,
            "properties": {
                "referenced_knowledge_points": {"type": "array", "items": {"type": "string"}},
                "lesson_ref": {"type": "string"},
                "curriculum_status": {"enum": ["verified", "partial", "unverified", "missing"]},
                "evidence_summary": {"type": "string", "minLength": 4},
                "page_refs": {"type": "array", "items": {"type": ["string", "integer"]}},
            },
        },
        "slides": {"type": "array", "minItems": 6, "maxItems": 40},
    },
}

# ---------------------------------------------------------------- 幻灯片类型
# required: 必填字段; notes_required: 该类型是否必须有教师讲稿 notes
SLIDE_REQUIREMENTS = {
    "cover":        {"required": ["title"], "notes_required": False},
    "objectives":   {"required": ["items"], "notes_required": True},
    "warmup":       {"required": ["items"], "notes_required": True},
    "concept":      {"required": ["steps"], "notes_required": True},
    "example":      {"required": ["problem", "solution_steps", "answer"], "notes_required": True},
    "misconception": {"required": ["wrong", "reason", "correct"], "notes_required": True},
    "practice":     {"required": ["items"], "notes_required": True},
    "summary":      {"required": ["items"], "notes_required": True},
    "board":        {"required": ["content"], "notes_required": False},
    "homework":     {"required": ["items"], "notes_required": True},
    "end":          {"required": [], "notes_required": False},
}
SLIDE_TYPES = set(SLIDE_REQUIREMENTS)

# practice 条目契约
PRACTICE_ITEM_REQUIRED = ["stem", "answer"]  # answer 渲染到答案页,卷面页不显示

# ---------------------------------------------------------------- 声明式图元
FIGURE_REQUIREMENTS = {
    "vertical_calc": {
        "required": ["operand_a", "operand_b", "operator"],
        "optional": ["result", "show_result", "carries"],
        "operators": ["+", "-", "×", "x", "*", "÷", "/"],
    },
    "number_line": {"required": ["start", "end", "step"], "optional": ["marks", "label", "arcs"]},
    "tianzige": {"required": ["chars"], "optional": ["pinyin"], "max_items": 6},
    "pinyin_line": {"required": ["pairs"], "optional": [], "pair_required": ["pinyin", "char"], "max_pairs": 12},
    "word_card": {"required": ["cards"], "optional": [], "card_required": ["word"],
                  "card_optional": ["phonetic", "meaning"], "max_cards": 8},
    "dialog_bubble": {"required": ["lines"], "optional": [], "line_required": ["speaker", "text"], "max_lines": 8},
    "place_value": {"required": ["digits"], "optional": ["label", "counters"],
                    "digit_keys": ["thousands", "hundreds", "tens", "ones"]},
    "table": {"required": ["headers", "rows"], "optional": ["label"], "max_rows": 8},
}
FIGURE_KINDS = set(FIGURE_REQUIREMENTS)

_NUM_RE = re.compile(r"\d+")


def _issue(code, message, severity="error", slide_id=None, hint=None):
    out = {"code": code, "severity": severity, "message": message}
    if slide_id:
        out["slide_id"] = slide_id
    if hint:
        out["hint"] = hint
    return out


def _extract_numbers(obj):
    """递归提取对象中的所有整数(用于数域拦截)。"""
    out = []
    if isinstance(obj, bool):
        return out
    if isinstance(obj, int):
        out.append(obj)
    elif isinstance(obj, float):
        out.append(int(obj))
    elif isinstance(obj, str):
        for m in _NUM_RE.findall(obj):
            out.append(int(m))
    elif isinstance(obj, dict):
        for v in obj.values():
            out.extend(_extract_numbers(v))
    elif isinstance(obj, list):
        for v in obj:
            out.extend(_extract_numbers(v))
    return out


def check_structure(data):
    """Tier 1: 信封 + 逐页结构检查。返回 issues。"""
    issues = []
    try:
        import jsonschema
        validator = jsonschema.Draft7Validator(ENVELOPE_SCHEMA)
        for err in sorted(validator.iter_errors(data), key=lambda e: list(e.absolute_path)):
            path = ".".join(str(p) for p in err.absolute_path)
            sid = None
            if len(err.absolute_path) >= 2 and err.absolute_path[0] == "slides":
                slides = data.get("slides") or []
                idx = err.absolute_path[1]
                if isinstance(idx, int) and idx < len(slides):
                    sid = slides[idx].get("slide_id")
            issues.append(_issue("SCHEMA_VIOLATION", f"{path or '<root>'}: {err.message}",
                                 slide_id=sid, hint="对照 references/courseware-json.md 修正结构。"))
    except ImportError:
        issues.append(_issue("JSONSCHEMA_MISSING", "未安装 jsonschema,跳过信封 Schema 校验",
                             severity="warning", hint="pip install jsonschema"))

    slides = data.get("slides")
    if not isinstance(slides, list):
        return issues
    seen_ids = set()
    n_content = 0
    for i, slide in enumerate(slides):
        sid = slide.get("slide_id") or f"slides[{i}]"
        stype = slide.get("type")
        if not stype or stype not in SLIDE_REQUIREMENTS:
            issues.append(_issue("UNKNOWN_SLIDE_TYPE", f"未知幻灯片类型: {stype!r}", slide_id=sid,
                                 hint=f"合法类型: {sorted(SLIDE_TYPES)}"))
            continue
        req = SLIDE_REQUIREMENTS[stype]["required"]
        for field in req:
            v = slide.get(field)
            if v is None or (isinstance(v, (str, list)) and not v):
                issues.append(_issue("MISSING_FIELD", f"{stype} 缺少必填字段 '{field}'", slide_id=sid))
        if SLIDE_REQUIREMENTS[stype]["notes_required"] and not (slide.get("notes") or "").strip():
            issues.append(_issue("MISSING_NOTES", f"{stype} 页缺少教师讲稿 notes", slide_id=sid,
                                 hint="notes 渲染进 PPT 备注栏,是教师授课台词,不允许为空。"))
        if slide.get("slide_id"):
            if slide["slide_id"] in seen_ids:
                issues.append(_issue("DUPLICATE_SLIDE_ID", f"slide_id 重复: {slide['slide_id']}", slide_id=sid))
            seen_ids.add(slide["slide_id"])
        if slide.get("figure"):
            issues.extend(_check_figure(slide.get("figure"), sid))
        if stype == "practice":
            for j, item in enumerate(slide.get("items") or []):
                for field in PRACTICE_ITEM_REQUIRED:
                    if not item.get(field):
                        issues.append(_issue("PRACTICE_ITEM_INCOMPLETE",
                                             f"练习第{j + 1}题缺少 '{field}'(答案渲染到答案页,卷面页不显示)",
                                             slide_id=sid))
                opts = item.get("options")
                if opts is not None and (not isinstance(opts, list) or not (2 <= len(opts) <= 6)):
                    issues.append(_issue("PRACTICE_OPTIONS_INVALID",
                                         f"练习第{j + 1}题 options 须为 2~6 项列表", slide_id=sid))
        if stype in ("objectives", "concept", "example", "misconception", "practice",
                     "summary", "homework", "warmup"):
            n_content += 1
    if n_content < 4:
        issues.append(_issue("TOO_FEW_CONTENT_SLIDES",
                             f"实质内容页仅 {n_content} 页(<4),一课时课件应至少包含目标/导入/新知/练习/小结",
                             hint="参考 references/workflow.md 的标准课件结构。"))
    return issues


def _check_figure(fig, sid):
    issues = []
    if not isinstance(fig, dict):
        return [_issue("FIGURE_INVALID", "figure 须为对象", slide_id=sid)]
    kind = fig.get("kind")
    spec = FIGURE_REQUIREMENTS.get(kind)
    if not spec:
        return [_issue("UNKNOWN_FIGURE_KIND", f"未知图元类型: {kind!r}", slide_id=sid,
                       hint=f"合法类型: {sorted(FIGURE_KINDS)}")]
    for field in spec["required"]:
        if fig.get(field) in (None, "", []):
            issues.append(_issue("FIGURE_MISSING_FIELD", f"图元 {kind} 缺少参数 '{field}'", slide_id=sid))
    if kind == "vertical_calc":
        if str(fig.get("operator")) not in spec["operators"]:
            issues.append(_issue("FIGURE_BAD_OPERATOR",
                                 f"竖式运算符须为 {spec['operators']}", slide_id=sid))
    if kind == "tianzige":
        chars = fig.get("chars") or []
        if isinstance(chars, list) and len(chars) > spec["max_items"]:
            issues.append(_issue("FIGURE_TOO_MANY", f"田字格一次最多 {spec['max_items']} 字", slide_id=sid))
        py = fig.get("pinyin")
        if py is not None and isinstance(py, list) and len(py) != len(chars):
            issues.append(_issue("FIGURE_MISMATCH", "tianzige 的 pinyin 数量须与 chars 一致", slide_id=sid))
    if kind == "pinyin_line":
        pairs = fig.get("pairs") or []
        if len(pairs) > spec["max_pairs"]:
            issues.append(_issue("FIGURE_TOO_MANY", f"拼音行一次最多 {spec['max_pairs']} 对", slide_id=sid))
        for j, pr in enumerate(pairs):
            for field in spec["pair_required"]:
                if not pr.get(field):
                    issues.append(_issue("FIGURE_MISSING_FIELD",
                                         f"拼音行第{j + 1}对缺少 '{field}'", slide_id=sid))
    if kind == "word_card":
        cards = fig.get("cards") or []
        if len(cards) > spec["max_cards"]:
            issues.append(_issue("FIGURE_TOO_MANY", f"词卡一次最多 {spec['max_cards']} 张", slide_id=sid))
        for j, c in enumerate(cards):
            if not c.get("word"):
                issues.append(_issue("FIGURE_MISSING_FIELD", f"词卡第{j + 1}张缺少 'word'", slide_id=sid))
    if kind == "dialog_bubble":
        lines = fig.get("lines") or []
        if len(lines) > spec["max_lines"]:
            issues.append(_issue("FIGURE_TOO_MANY", f"对话气泡一次最多 {spec['max_lines']} 句", slide_id=sid))
        for j, ln in enumerate(lines):
            for field in spec["line_required"]:
                if not ln.get(field):
                    issues.append(_issue("FIGURE_MISSING_FIELD",
                                         f"对话第{j + 1}句缺少 '{field}'", slide_id=sid))
    if kind == "place_value":
        digits = fig.get("digits") or {}
        for k in digits:
            if k not in spec["digit_keys"]:
                issues.append(_issue("FIGURE_BAD_KEY",
                                     f"place_value.digits 非法键 '{k}',合法: {spec['digit_keys']}", slide_id=sid))
    if kind == "table":
        rows = fig.get("rows") or []
        headers = fig.get("headers") or []
        for j, r in enumerate(rows):
            if isinstance(r, list) and headers and len(r) != len(headers):
                issues.append(_issue("FIGURE_MISMATCH",
                                     f"表格第{j + 1}行列数({len(r)})与表头({len(headers)})不一致", slide_id=sid))
        if len(rows) > spec["max_rows"]:
            issues.append(_issue("FIGURE_TOO_MANY", f"表格最多 {spec['max_rows']} 行", slide_id=sid))
    return issues


def check_semantics(data, unit_meta=None, knowledge_point_ids=None, lesson_ids=None):
    """Tier 2/3: 知识点白名单、课时归属、数域上界、溯源检查。

    unit_meta: query 得到的 metadata.yaml 内容(None 则跳过数域检查)
    knowledge_point_ids: 该单元知识点 ID 白名单(set)
    lesson_ids: 该单元全部课时/课文 lesson_id 集合(set of str,精确匹配)
    """
    issues = []
    meta = data.get("metadata") or {}
    evidence = data.get("curriculum_evidence") or {}
    kps = knowledge_point_ids

    referenced = evidence.get("referenced_knowledge_points") or []
    if kps is not None:
        unknown = [p for p in referenced if p not in kps]
        if unknown:
            issues.append(_issue("KP_NOT_IN_UNIT",
                                 f"curriculum_evidence 引用了不属于本单元的知识点: {unknown}",
                                 hint="只能引用 query_curriculum.py 返回的 point_id。"))
    slide_kp_refs = []
    for slide in data.get("slides") or []:
        src = slide.get("source") or {}
        pid = src.get("point_id")
        if pid:
            slide_kp_refs.append((slide.get("slide_id"), pid))
        if slide.get("type") == "practice":
            for item in slide.get("items") or []:
                if (item.get("source") or {}).get("point_id"):
                    slide_kp_refs.append((slide.get("slide_id"), item["source"]["point_id"]))
    if kps is not None:
        for sid, pid in slide_kp_refs:
            if pid not in kps:
                issues.append(_issue("KP_NOT_IN_UNIT",
                                     f"幻灯片溯源知识点 {pid} 不在本单元白名单内", slide_id=sid))

    if lesson_ids is not None and meta.get("lesson_id"):
        if str(meta["lesson_id"]) not in lesson_ids:
            issues.append(_issue("LESSON_NOT_IN_UNIT",
                                 f"lesson_id '{meta['lesson_id']}' 不属于本单元课时集合",
                                 hint="lesson_id 须取自素材包 lessons_index。"))

    upper = (unit_meta or {}).get("numeric_upper_bound")
    if upper and meta.get("subject") == "math":
        for slide in data.get("slides") or []:
            sid = slide.get("slide_id")
            if slide.get("figure"):
                nums = _extract_numbers(slide["figure"])
                over = [n for n in nums if n > int(upper)]
                if over:
                    issues.append(_issue("NUMBER_OVER_BOUND",
                                         f"图元出现超出本单元数域上界 {upper} 的数: {sorted(set(over))[:6]}",
                                         slide_id=sid,
                                         hint="数学课件中的数不得超纲,参考知识点 teaching_boundary.scope_allowed。"))
            if slide.get("type") == "practice":
                for item in slide.get("items") or []:
                    nums = _extract_numbers(item.get("stem", "")) + _extract_numbers(item.get("answer", ""))
                    over = [n for n in nums if n > int(upper)]
                    if over:
                        issues.append(_issue("NUMBER_OVER_BOUND",
                                             f"练习题干/答案出现超出数域上界 {upper} 的数: {sorted(set(over))[:6]}",
                                             slide_id=sid))
    page_range = (unit_meta or {}).get("page_range")
    if page_range:
        m = re.match(r"P(\d+)-P(\d+)", str(page_range))
        if m:
            lo, hi = int(m.group(1)), int(m.group(2))
            for slide in data.get("slides") or []:
                page = (slide.get("source") or {}).get("textbook_page")
                if isinstance(page, int) and not (lo <= page <= hi):
                    issues.append(_issue("PAGE_OUT_OF_RANGE",
                                         f"溯源页码 P{page} 超出单元页码范围 {page_range}",
                                         slide_id=slide.get("slide_id")))
    return issues


def validate(data, unit_meta=None, knowledge_point_ids=None, lesson_ids=None):
    """完整三层校验,返回 (errors, warnings)。"""
    issues = check_structure(data)
    issues += check_semantics(data, unit_meta, knowledge_point_ids, lesson_ids)
    errors = [i for i in issues if i["severity"] == "error"]
    warnings = [i for i in issues if i["severity"] == "warning"]
    return errors, warnings
