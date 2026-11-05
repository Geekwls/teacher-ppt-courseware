# AGENTS.md — 教师 PPT 课件生成项目 (teacher-ppt-courseware)

> 任何 AI Agent(Codex / Gemini CLI / Cursor / Copilot / Antigravity 等)
> 在本仓库工作时遵循本文件。通用技能入口:`plugin/skills/lesson-courseware/`(Agent Skills
> 开放标准格式,含 SKILL.md)。

## 本项目是什么

人教统编版**课时 PPT 课件生成系统**(小学1~6年级语数英 + 初中一年级语文试点,目前仅上册第一单元):教师给出自然语言指令
(如"帮我做三年级上册数学第四单元第1课时的课件"或"做初一语文《春》的课件"),Agent 按五步工作流产出可编辑 `.pptx`。

四层架构(物理隔离,禁止混杂;唯一管线为 LessonPlan → PPTX,旧 courseware.json 页面级管线已于 2026-11 退役):
1. `plugin/knowledge/` — 教材知识库(**只读事实源**,158单元/557知识点,含教材例题/教参重难点易错点)
2. `plugin/skills/lesson-courseware/` — Agent Skill(SKILL.md + references + scripts)
3. `lib_js/lesson/lesson_validator.js` — 教学设计门禁(知识点归属/数域递归全字段扫描/算式真值/教学禁区词界防误杀,一票否决) + `lib_js/presentation/` 表现规划与门禁
4. `scripts/build_courseware.js` + `lib_js/rendering/presentation_renderer.js` — 一键流水线:教学门禁 → 容量规划(含算理超载拆页与初中长文本智能拆页) → 表现门禁 → PptxGenJS 确定性渲染 → 原生动效注入 → `layout_audit.js` 几何体检(--strict 一票否决)

## 硬性纪律(违反即返工)

1. **先取材后创作**:写教学设计前必须运行 `query_curriculum.js`,内容只能引用其返回的 point_id;
2. **不超纲**:数学数字受单元 `numeric_upper_bound` 约束(lesson_validator 递归扫描 content_block 全字段);不得出现 `teaching_boundary.scope_excluded` 内容;
3. **讲稿完备**:每个教学环节 `teacher_guidance` 必填(渲染进 PPT 备注栏);
4. **不直接产出 pptx**:一律走 LessonPlan JSON → build_courseware 一键流水线(校验+规划+渲染);**禁止为迁就某次生成而修改渲染器源码**(架构评审/缺陷修复不受此限);
5. **诚实溯源**:`curriculum_status` 如实引用素材包值,绝不虚构教材页码;
6. **知识库是数据不是代码**:发现内容错误修 YAML 并记 provenance,不为迁就生成而改事实源;
7. **几何体检**:交付前看 `.audit.json` 的 `summary.critical`,非 0 必须修内容后重渲染(`--strict` 会自动拒绝交付);warnings 如实转述。

## 命令速查(在仓库根或 skill 目录均可)

```bash
# 0) 依赖(首次)
npm install

# 1) 取材:课时素材包(教材例题+知识点+教参易错点)
node plugin/skills/lesson-courseware/scripts/query_curriculum.js \
    --prompt "三年级上册数学第四单元第1课时"
#   --list-units --subject math --grade 3 --term term-1   列单元
#   --search "口算乘法"                                    跨库检索

# 2) 创作教学设计 (LessonPlan AST):契约 references/schemas/lesson-plan.schema.json
#    金样参考: acceptance/lesson_plans/*.json(三科四份)
#    学科规则必读: references/{math,chinese,english}-rules.md

# 3) 单独校验教学设计(可选;build 已内置)
node plugin/skills/lesson-courseware/scripts/validate_lesson_plan.js --input <lesson_plan.json>

# 4) 一键交付(教学门禁→容量规划→表现门禁→确定性渲染→动效注入→--strict 几何门禁)
node plugin/skills/lesson-courseware/scripts/build_courseware.js \
    --input <lesson_plan.json> --outdir <输出目录> [--strict]

# 5) 自检(金样端到端验收 + 策略/分页单元测试,退出码 0=通过)
npm test
```

## 关键文档

| 文档 | 用途 |
|---|---|
| `plugin/skills/lesson-courseware/SKILL.md` | 技能主入口:五步工作流与五条纪律 |
| `plugin/skills/lesson-courseware/references/workflow.md` | 各步细则与话术模板 |
| `plugin/skills/lesson-courseware/references/schemas/lesson-plan.schema.json` | 教学设计契约(LessonPlan AST) |
| `plugin/skills/lesson-courseware/references/schemas/presentation.schema.json` | 表现层契约(Presentation AST,含图元) |
| `plugin/skills/lesson-courseware/references/modular-architecture.md` | 分层解耦架构规范(双 AST 设计) |
| `plugin/skills/lesson-courseware/references/knowledge-base.md` | 知识库结构与引用纪律 |
| `plugin/skills/lesson-courseware/references/dynamic-media-architecture.md` | 动态媒体与微课视频扩展架构规范 (受控子引擎/三阶段路线) |
| `evals/README.md` | 评测协议(P/R/O/M 四桶 rubric) |

## 多 Agent 安装形态

- Codex / Antigravity 及遵循共享约定的工具: 本仓库 `.agents/skills/`;
- 其他 agent: 直接读本文件 + `plugin/skills/lesson-courseware/`(标准 SKILL.md 结构, 脚本均可用 Node.js 独立执行);
- 同步正本: `node scripts/install_skill.js`(详见 README「多 Agent 安装」)。
