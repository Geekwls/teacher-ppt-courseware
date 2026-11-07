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
3. `plugin/skills/lesson-courseware/lib_js/lesson/lesson_validator.js` — 教学设计门禁(知识点归属/数域递归全字段扫描/算式真值/教学禁区词界防误杀,一票否决) + `lib_js/presentation/` 表现规划与门禁(Layout Registry 为版式唯一事实源)
4. `plugin/skills/lesson-courseware/scripts/build_courseware.js` + `lib_js/pipeline/courseware_builder.js` + `lib_js/rendering/` — 一键流水线:教学门禁 → 课型骨架诊断/补齐(`lib_js/strategies/lesson_skeleton.js`) → 容量规划(含算理超载拆页与初中长文本智能拆页) → 表现门禁 → PptxGenJS 确定性渲染(按版式拆分的 renderers) → 原生动效注入 → `layout_audit.js` 几何体检(--strict 一票否决)

## 仓库导览(什么放哪里)

```
plugin/knowledge/            教材知识库 SSOT(只读事实源, 158 单元 × 五件套 YAML)
plugin/skills/lesson-courseware/   生成引擎正本: SKILL.md + references(契约/策略/版式) + scripts(CLI) + lib_js(分层引擎)
content/lesson_plans/        教学设计源(内容资产, 按学科分域, 准入与命名规范见其 README)
acceptance/lesson_plans/     回归金样(只读测试夹具, 按学科分域, 晋级纪律见其 README)
test/{unit,contract,snapshots}/    单测 + 可执行契约 + 金样 AST 快照
evals/                       LLM-as-judge 评测协议(P/R/O/M rubric)
scripts/                     仓库工具: 验收 / 知识库审计 / 技能同步 / 快照生成
output/                      运行产物(gitignore, 可随时删除重建)
```

一个课时的一生: `query_curriculum 取材` → `content/lesson_plans/<学科>/ 创作/迭代`
→ `build_courseware --strict` → `output/<lesson_id>/ 三件套`; 只有被确认为"必须永远
生成正确"的形态才晋级进 `acceptance/`(并补 AST 快照)。

教学设计文件命名(与 lesson_id 一一对应):
`{subject}_g{年级}_t{册1|2}_u{单元02d}_l{课时02d}[_slug]_lesson_plan.json`。

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
#    金样参考: acceptance/lesson_plans/*.json(三科六份,覆盖新授/练习/复习三种课型)
#    学科规则必读: references/{math,chinese,english}-rules.md

# 3) 单独校验教学设计(可选;build 已内置)
node plugin/skills/lesson-courseware/scripts/validate_lesson_plan.js --input <lesson_plan.json>

# 4) 一键交付(教学门禁→课型骨架补齐→容量规划→表现门禁→确定性渲染→动效注入→--strict 几何门禁)
node plugin/skills/lesson-courseware/scripts/build_courseware.js \
    --input <lesson_plan.json> --outdir <输出目录> [--strict] [--style warm] [--no-skeleton-fill]

# 5) 自检(单元/契约/快照 + 金样端到端 + 知识库结构审计,退出码 0=通过)
npm test

# 6) 全量风格矩阵(6 金样 x 5 风格,较慢)
npm run test:matrix
```

## 关键文档

| 文档 | 用途 |
|---|---|
| `plugin/skills/lesson-courseware/SKILL.md` | 技能主入口:五步工作流与五条纪律 |
| `plugin/skills/lesson-courseware/references/workflow.md` | 各步细则与话术模板 |
| `plugin/skills/lesson-courseware/references/schemas/lesson-plan.schema.json` | 教学设计契约(LessonPlan AST) |
| `plugin/skills/lesson-courseware/references/schemas/presentation.schema.json` | 表现层契约(Presentation AST,含图元) |
| `plugin/skills/lesson-courseware/references/modular-architecture.md` | 分层解耦架构规范(双 AST 设计 + Layout Registry) |
| `plugin/skills/lesson-courseware/references/strategies/content-packs.yaml` | 学科兜底内容包(板书/作业/拆页文案,教学内容资产) |
| `plugin/skills/lesson-courseware/references/strategies/quality-rules.yaml` | 质量规则包(错别字/禁区词边界例外/数域扫描策略) |
| `plugin/skills/lesson-courseware/references/strategies/block-layout-map.yaml` | 内容块→版式映射(单元/学科级覆盖,换版面不改代码) |
| `plugin/skills/lesson-courseware/references/strategies/policy-packs.yaml` | 单元/课时策略偏好包(第四维策略入口) |
| `plugin/skills/lesson-courseware/references/layouts/composite-specs.yaml` | 声明式组合版式库(网格+槽位+时序,数据定义新版面) |
| `plugin/skills/lesson-courseware/references/knowledge-base.md` | 知识库结构与引用纪律 |
| `plugin/skills/lesson-courseware/references/dynamic-media-architecture.md` | 动态媒体与微课视频扩展架构规范 (受控子引擎/三阶段路线) |
| `evals/README.md` | 评测协议(P/R/O/M 四桶 rubric) |

## 多 Agent 安装形态

- Codex / Antigravity 及遵循共享约定的工具: 本仓库 `.agents/skills/`;
- 其他 agent: 直接读本文件 + `plugin/skills/lesson-courseware/`(标准 SKILL.md 结构, 脚本均可用 Node.js 独立执行);
- 同步正本: `node scripts/install_skill.js`(详见 README「多 Agent 安装」)。
