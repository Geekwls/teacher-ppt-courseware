# -*- coding: utf-8 -*-
"""知识库定位 (kb_locate)。

解析顺序(取第一个命中者,命中判定:目录内含 manifest.json 且含 curriculum/):
  1. 环境变量 COURSEWARE_KNOWLEDGE_DIR
  2. skill 自带布局: 本文件位于 <plugin>/skills/lesson-courseware/lib → <plugin>/knowledge
  3. 自模块目录与当前工作目录向上逐级找 <root>/plugin/knowledge 或 <root>/knowledge
     (覆盖 install_skill.py 把 skill 安装到其他项目 .agents/skills/ 的场景)
返回绝对路径;找不到返回 None,调用方以 KB_LOCATE_FAILED 明确报错,绝不静默跳过。
"""

import os

_MARKER_FILES = ("manifest.json", "curriculum")


def _is_kb(path):
    return os.path.isdir(path) and all(
        os.path.exists(os.path.join(path, m)) for m in _MARKER_FILES)


def find_kb_root():
    env = os.environ.get("COURSEWARE_KNOWLEDGE_DIR")
    if env and _is_kb(env):
        return os.path.abspath(env)
    here = os.path.dirname(os.path.abspath(__file__))
    bundled = os.path.normpath(os.path.join(here, "..", "..", "..", "knowledge"))
    if _is_kb(bundled):
        return bundled
    for base in (here, os.getcwd()):
        root = base
        for _ in range(6):
            for cand in (os.path.join(root, "plugin", "knowledge"),
                         os.path.join(root, "knowledge")):
                if _is_kb(cand):
                    return os.path.abspath(cand)
            parent = os.path.dirname(root)
            if parent == root:
                break
            root = parent
    return None
