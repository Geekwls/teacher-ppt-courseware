# AGENTS.md — 教师 PPT 课件生成项目 (teacher-ppt-courseware)

> 任何 AI Agent(Codex / Gemini CLI / Cursor / Copilot / Antigravity 等)
> 在本仓库工作时遵循本文件。通用技能入口:`plugin/skills/lesson-courseware/`(Agent Skills
> 开放标准格式,含 SKILL.md)。

## 本项目是什么

小学人教版**课时 PPT 课件生成系统**(语数英三科):教师给出自然语言指令
(如"帮我做三年级上册数学第四单元第1课时的课件"),Agent 按五步工作流产出可编辑 `.pptx`。

四层架构(物理隔离,禁止混杂):
1. `plugin/knowledge/` — 教材知识库(**只读事实源**,157单元/556知识点,含教材例题/教参重难点易错点)
2. `plugin/skills/lesson-courseware/` — Agent Skill(SKILL.md + references + scripts)
3. `plugin/skills/lesson-courseware/scripts/validate_courseware.js` — 确定性校验门禁(结构/页面字段白名单/知识点归属/数域/红线,一票否决)
4. `plugin/skills/lesson-courseware/scripts/render_deck.js` + `lib_js/` — PptxGenJS 确定性渲染引擎 + `layout_audit.js` 几何体检

## 硬性纪律(违反即返工)

1. **先取材后创作**:写课件 JSON 前必须运行 `query_curriculum.js`,内容只能引用其返回的 point_id;
2. **不超纲**:数学数字受单元 `numeric_upper_bound` 约束;不得出现 `teaching_boundary.scope_excluded` 内容;
3. **讲稿完备**:内容页 `notes` 必填(渲染进 PPT 备注栏);
4. **不直接产出 pptx**:一律走 契约 JSON → 校验 → 确定性渲染;**禁止为迁就某次生成而修改渲染器源码**(架构评审/缺陷修复不受此限);
5. **诚实溯源**:`curriculum_status` 如实引用素材包值,绝不虚构教材页码;
6. **知识库是数据不是代码**:发现内容错误修 YAML 并记 provenance,不为迁就生成而改事实源;
7. **几何体检**:交付前看 `.audit.json` 的 `summary.critical`,非 0 必须修内容后重渲染;warnings 如实转述。

## 命令速查(在仓库根或 skill 目录均可)

```bash
# 0) 依赖(首次)
npm install

# 1) 取材:课时素材包(教材例题+知识点+教参易错点)
node plugin/skills/lesson-courseware/scripts/query_curriculum.js \
    --prompt "三年级上册数学第四单元第1课时"
#   --list-units --subject math --grade 3 --term term-1   列单元
#   --search "口算乘法"                                    跨库检索

# 2) 创作课件 JSON:必读契约 plugin/skills/lesson-courseware/references/courseware-json.md
#    金样参考: references/example_courseware.json 与 acceptance/*.json(三科各一)
#    学科规则必读: references/{math,chinese,english}-rules.md

# 3) 校验(退出码 0 才可渲染;按 errors[].code 定向修复后重跑)
node plugin/skills/lesson-courseware/scripts/validate_courseware.js --input <courseware.json>

# 4) 渲染交付(校验 + 渲染 + --strict 几何门禁;产出 <标题>.pptx / .json / .audit.json)
bash plugin/skills/lesson-courseware/scripts/render_all.sh <courseware.json> <输出目录>

# 5) 自检(三科金样端到端,退出码 0=通过)
npm test
# 或 node scripts/run_acceptance.js
```

## 关键文档

| 文档 | 用途 |
|---|---|
| `plugin/skills/lesson-courseware/SKILL.md` | 技能主入口:五步工作流与五条纪律 |
| `plugin/skills/lesson-courseware/references/workflow.md` | 各步细则与话术模板 |
| `plugin/skills/lesson-courseware/references/courseware-json.md` | 课件 JSON 契约(页型/字段/图元) |
| `plugin/skills/lesson-courseware/references/knowledge-base.md` | 知识库结构与引用纪律 |
| `plugin/skills/lesson-courseware/references/dynamic-media-architecture.md` | 动态媒体与微课视频扩展架构规范 (受控子引擎/三阶段路线) |
| `evals/README.md` | 评测协议(P/R/O/M 四桶 rubric) |

## 多 Agent 安装形态

- Codex / Antigravity 及遵循共享约定的工具: 本仓库 `.agents/skills/`;
- 其他 agent: 直接读本文件 + `plugin/skills/lesson-courseware/`(标准 SKILL.md 结构, 脚本均可用 Node.js 独立执行);
- 同步正本: `node scripts/install_skill.js`(详见 README「多 Agent 安装」)。
