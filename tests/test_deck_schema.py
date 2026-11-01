# -*- coding: utf-8 -*-
"""deck_schema 三层校验测试。"""
import json
import os

from lib.deck_schema import check_semantics, check_structure, validate

_HERE = os.path.dirname(os.path.abspath(__file__))
EXAMPLE = os.path.join(os.path.dirname(_HERE), "plugin", "skills", "lesson-courseware",
                       "references", "example_courseware.json")


def load_example():
    with open(EXAMPLE, encoding="utf-8") as f:
        return json.load(f)


def test_example_deck_passes():
    data = load_example()
    errors, warnings = validate(data)
    assert errors == [], errors
    assert warnings == [], warnings


def test_unknown_slide_type():
    data = load_example()
    data["slides"][1]["type"] = "magic_page"
    errors, _ = validate(data)
    assert any(e["code"] == "UNKNOWN_SLIDE_TYPE" for e in errors)


def test_missing_required_field():
    data = load_example()
    del data["slides"][3]["steps"]  # concept
    errors, _ = validate(data)
    assert any(e["code"] == "MISSING_FIELD" and "steps" in e["message"] for e in errors)


def test_missing_notes_rejected():
    data = load_example()
    data["slides"][4]["notes"] = "  "
    errors, _ = validate(data)
    assert any(e["code"] == "MISSING_NOTES" for e in errors)


def test_duplicate_slide_id():
    data = load_example()
    data["slides"][2]["slide_id"] = data["slides"][1]["slide_id"]
    errors, _ = validate(data)
    assert any(e["code"] == "DUPLICATE_SLIDE_ID" for e in errors)


def test_schema_violation_bad_deck_id():
    data = load_example()
    data["deck_id"] = "deck-1"
    errors, _ = validate(data)
    assert any(e["code"] == "SCHEMA_VIOLATION" for e in errors)


def test_practice_item_missing_answer():
    data = load_example()
    del data["slides"][7]["items"][0]["answer"]
    errors, _ = validate(data)
    assert any(e["code"] == "PRACTICE_ITEM_INCOMPLETE" for e in errors)


def test_too_few_content_slides():
    data = load_example()
    data["slides"] = [s for s in data["slides"] if s["type"] in ("cover", "end")]
    errors, _ = validate(data)
    assert any(e["code"] == "TOO_FEW_CONTENT_SLIDES" for e in errors)


# ------------------------------------------------------------ 图元
def test_unknown_figure_kind():
    data = load_example()
    data["slides"][3]["figure"] = {"kind": "hologram"}
    errors, _ = validate(data)
    assert any(e["code"] == "UNKNOWN_FIGURE_KIND" for e in errors)


def test_tianzige_pinyin_mismatch():
    data = load_example()
    data["slides"][3]["figure"] = {"kind": "tianzige", "chars": ["金", "色"], "pinyin": ["jīn"]}
    errors, _ = validate(data)
    assert any(e["code"] == "FIGURE_MISMATCH" for e in errors)


def test_vertical_calc_bad_operator():
    data = load_example()
    data["slides"][4]["figure"] = {"kind": "vertical_calc", "operand_a": 20,
                                   "operand_b": 3, "operator": "%"}
    errors, _ = validate(data)
    assert any(e["code"] == "FIGURE_BAD_OPERATOR" for e in errors)


def test_word_card_missing_word():
    data = load_example()
    data["slides"][4]["figure"] = {"kind": "word_card", "cards": [{"meaning": "x"}]}
    errors, _ = validate(data)
    assert any(e["code"] == "FIGURE_MISSING_FIELD" for e in errors)


# ------------------------------------------------------------ 语义(Tier 2/3)
def test_kp_whitelist():
    data = load_example()
    errors, _ = validate(data, knowledge_point_ids={"math-g3-t1-u04-p01"})
    assert not any(e["code"] == "KP_NOT_IN_UNIT" for e in errors)
    errors, _ = validate(data, knowledge_point_ids={"other-kp"})
    assert any(e["code"] == "KP_NOT_IN_UNIT" for e in errors)


def test_lesson_membership():
    data = load_example()
    ids = {f"lesson-0{i}" for i in range(1, 7)}
    errors, _ = validate(data, lesson_ids=ids)
    assert not any(e["code"] == "LESSON_NOT_IN_UNIT" for e in errors)
    errors, _ = validate(data, lesson_ids={"lesson-02", "lesson-03"})
    assert any(e["code"] == "LESSON_NOT_IN_UNIT" for e in errors)


def test_number_over_bound():
    data = load_example()
    data["slides"][7]["items"][0]["stem"] = "口算: 20000 × 3 ="
    unit_meta = {"numeric_upper_bound": 10000, "page_range": "P39-P56"}
    errors, _ = validate(data, unit_meta=unit_meta)
    assert any(e["code"] == "NUMBER_OVER_BOUND" for e in errors)


def test_number_over_bound_in_figure():
    data = load_example()
    data["slides"][4]["figure"] = {"kind": "vertical_calc", "operand_a": 99999,
                                   "operand_b": 3, "operator": "×", "result": 299997}
    unit_meta = {"numeric_upper_bound": 10000}
    errors, _ = validate(data, unit_meta=unit_meta)
    assert any(e["code"] == "NUMBER_OVER_BOUND" and "slide_id" in e for e in errors)


def test_page_out_of_range():
    data = load_example()
    data["slides"][4]["source"]["textbook_page"] = 90
    unit_meta = {"page_range": "P39-P56"}
    errors, _ = validate(data, unit_meta=unit_meta)
    assert any(e["code"] == "PAGE_OUT_OF_RANGE" for e in errors)


def test_extract_numbers_handles_strings_and_nesting():
    from lib.deck_schema import _extract_numbers
    assert _extract_numbers({"a": "20×3", "b": [1, {"c": "x2"}]}) == [20, 3, 1, 2]
