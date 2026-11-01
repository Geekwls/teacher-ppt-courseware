# 渲染 .pptx 课件

## 规则
- **不要打开、阅读或 grep 渲染器源码**(`scripts/render_deck.py`、`lib/`)。你只负责产出符合 `references/courseware-json.md` 的课件 JSON,渲染由确定性引擎完成。
- 渲染前**必须**先通过校验;渲染器的预检也会拒绝含结构错误的 JSON。

## 命令(在 skill 目录 `plugin/skills/lesson-courseware/` 下执行)

```bash
# 一步到位:校验 + 渲染 + 复制源 JSON 进输出目录(推荐)
bash scripts/render_all.sh <courseware.json> <输出目录>

# 或分步
python scripts/validate_courseware.py --input <courseware.json>
python scripts/render_deck.py --input <courseware.json> --outdir <输出目录>
```

## 输出
- `<输出目录>/<课件标题>.pptx`(16:9,可在 PowerPoint / WPS 中继续编辑)
- 同目录附带课件 JSON 副本(便于追溯与重渲染)
- 教师讲稿在每页**备注栏**;练习页默认自动追加"参考答案"页
- 渲染结果 JSON 中 `warnings` 非空时(如内容溢出自动拆页),向教师如实转述

## 交付话术
渲染成功后,向教师报告:文件路径、页数、依据的知识点与教材页码;若知识库状态为 partial,明确提醒"内容依据教材整理,课前请自行核对"。
