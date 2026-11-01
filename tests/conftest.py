# -*- coding: utf-8 -*-
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKILL = os.path.join(ROOT, "plugin", "skills", "lesson-courseware")
for p in (SKILL, ROOT):
    if p not in sys.path:
        sys.path.insert(0, p)
