# 渲染 .pptx 课件

## 规则
- **不要为迁就某一次课件生成而修改渲染器源码**(`scripts/render_deck.js`、`lib_js/`)。你只负责产出符合 `references/courseware-json.md` 的课件 JSON,渲染由确定性引擎完成。架构评审与缺陷修复时读源码不受此限。
- 渲染前**必须**先通过校验;`render_all.sh` 已内置「校验 → 渲染 → 几何审计(`--strict`)」全链路。
- 技术栈是 **Node.js + PptxGenJS**,不是 python-pptx。

## 命令(在 skill 目录 `plugin/skills/lesson-courseware/` 下执行)

```bash
# 一步到位(推荐):校验 + 渲染 + 几何审计 + 复制源 JSON 进输出目录
bash scripts/render_all.sh <courseware.json> <输出目录>

# 或分步
node scripts/validate_courseware.js --input <courseware.json>
node scripts/render_deck.js --input <courseware.json> --outdir <输出目录> --strict
```

`--quiet` 只精简修复提示,**不会隐藏 warnings**;`--strict` 在存在 critical 级几何问题时拒绝交付。

## 输出
- `<输出目录>/<课件标题>.pptx`(16:9,可在 PowerPoint / WPS 中继续编辑)
- `<输出目录>/<课件标题>.json` 契约副本(便于追溯与重渲染)
- `<输出目录>/<课件标题>.audit.json` **渲染结果几何审计回执**
- 教师讲稿在每页**备注栏**;练习页默认自动追加"参考答案"页
- 几何审计检查:画布越界、文本溢出裁切、文本互相压盖、参考答案缺题。审计码见 `lib_js/layout_audit.js`

## 交付前必做
查看 `.audit.json` 的 `summary.critical`。非 0 时按 `issues[].code` 定向修内容(缩短文本、拆分页面、降低字号)后重渲染,不要直接改 pptx;有 warning 时向教师如实转述。

## 交付话术
渲染成功后,向教师报告:文件路径、页数、依据的知识点与教材页码;若知识库状态为 partial,明确提醒"内容依据教材整理,课前请自行核对"。
