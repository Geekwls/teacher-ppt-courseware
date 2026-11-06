# 人教统编版中小学教师 PPT 课件生成插件 (teacher-ppt-courseware)

> **一句话定位**:老师对 AI 助手说一句"帮我做三年级上册数学第四单元第1课时的课件"或"做初一语文《春》的课件",
> 得到一份可直接放映、可继续编辑的 `.pptx`——例题有教材页码、易错点有教参依据、
> 练习带参考答案页、每页备注栏里有讲稿。知识库现覆盖小学 1~6 年级语数英 158 单元,另含初一语文上册第一单元试点;
>
> **架构借鉴** [anthropics/k12-teacher-skills](https://github.com/anthropics/k12-teacher-skills),
> 内容底座复用同工作区 `primary-school-practice-skill` 的人教版五层教材知识库,详见 [NOTICE.md](NOTICE.md)。

---

## 一、架构:四层物理隔离

```
+---------------------------------------------------------------------+
| 1. 教材知识库 (plugin/knowledge/)                                     |
|    五层事实源:metadata / lessons(教材例题原文) / knowledge_points     |
|    (教学目标·边界) / teaching_reference(教参重难点·典型错因) / 蓝图    |
|    158 单元 / 557 知识点,verified 需原始凭证,绝不假造                 |
+---------------------------------------------------------------------+
                                  │
+---------------------------------------------------------------------+
| 2. 课件 Skill (plugin/skills/lesson-courseware/)                     |
|    SKILL.md 五步工作流:路由→澄清→取材→创作教学设计→一键构建→迭代      |
|    宿主大模型即教学设计引擎,输出 LessonPlan AST(纯教学逻辑)           |
+---------------------------------------------------------------------+
                                  │
+---------------------------------------------------------------------+
| 3. 教学设计门禁 + 表现规划                                          |
|    skill/lib_js/lesson/ + skill/lib_js/presentation/                 |
|    Tier1 Schema/环节闭环/讲稿完备 · Tier2 知识点白名单/数域递归全字段  |
|    Tier3 算式真值/教学边界红线 —— 一票否决+定向自愈                    |
|    PagePlanner: 学段认知×学科策略自动拆页编排(容量评估/练习答案分离)   |
+---------------------------------------------------------------------+
                                  │
+---------------------------------------------------------------------+
| 4. 一键确定性渲染                                                    |
|    scripts/build_courseware.js + skill/lib_js/rendering/             |
|    PptxGenJS 渲染 Presentation AST:封面/目标/分步算理/例题/易错/练习   |
|    田字格·数轴·声明式算理动画(FFmpeg 合成视频,数学门禁前置)·防近视大字  |
|    讲稿进备注栏;练习自动生成参考答案页;partial 状态页脚如实提示         |
|    渲染后输出 .audit.json 几何体检(越界/裁切/压盖),--strict 拒绝交付    |
|    每页自动编排「单击逐步出现」播放步骤(封面/结束页除外)                 |
+---------------------------------------------------------------------+
```

> 图中 `skill/` = `plugin/skills/lesson-courseware/`

**Non-Goals**:不做海量课件预生成(现场按课时创作);不做未经核验的教材宣称;
不直接产出 pptx 二进制(一律经 JSON 契约+校验+确定性渲染,同输入恒同输出)。

## 二、目录结构

```
teacher-ppt-courseware/
├── AGENTS.md                           # 所有 Agent 的通用入口(项目说明+纪律+命令速查)
├── plugin/
│   ├── knowledge/                      # 【独立】人教版五层知识库(vendored)
│   └── skills/lesson-courseware/
│       ├── SKILL.md                    # 入口:五步工作流 + 五条纪律
│       ├── references/                 # workflow / 双 AST 契约(schemas/) / 三科规则 / 策略与质量规则包
│       ├── scripts/                    # query_curriculum / validate_lesson_plan / build_courseware / patch_courseware
│       └── lib_js/                     # domain 常量 / lesson 校验 / presentation 注册表 / rendering 渲染 / pipeline
├── test/                               # 单元测试 + 契约测试 + 金样 AST 快照
├── evals/                              # LLM-as-judge 评测协议 + rubric CSV(shared+三科)
├── content/lesson_plans/               # 可复用教学设计源(示例课件)
├── acceptance/                         # 三科金样 lesson_plan.json(只读)
├── scripts/                            # run_acceptance.js / install_skill.js / update_snapshots.js
└── package.json                        # 纯 Node.js 现代全栈依赖 (PptxGenJS, ajv, js-yaml)
```

## 三、安装与使用

> 所有 Agent 均可使用: 仓库根的 **[AGENTS.md](AGENTS.md)** 是通用入口(Codex / Gemini CLI / Cursor /
> Copilot / Zed / Antigravity 等开机自动读取), 指向标准 SKILL.md 与可独立执行的脚本;
> Skill 采用 Agent Skills 开放标准(`SKILL.md` 目录)。

### 最省事的方式: 让 AI 助手装(推荐给老师)

不用自己配环境、不用记命令, 把仓库地址交给你的 AI 助手(Claude Code / Codex / CodeBuddy 等):

> 把 github.com/Geekwls/teacher-ppt-courseware 装成你的 skill

助手会自己克隆、装依赖、把技能注册到发现目录。装完直接说需求即可:

> 帮我做三年级上册数学第四单元第 1 课时的课件

下面两节是给需要手动控制安装位置、或想在本仓库内开发调试的人看的。

| 使用环境 | 发现机制 | 说明 |
|---|---|---|
| Codex / Antigravity | `.agents/skills/`(共享约定) | 自动发现 |
| 其他 Agent(含网页/托管 agent) | 读 `AGENTS.md` → 按 SKILL.md 工作流调用脚本 | 无需技能发现能力, 能读文件跑命令即可 |
| 人(无 Agent) | 直接跑三科金样 + 改 JSON 重渲染 | `npm test` 或 `node scripts/run_acceptance.js` |

### 同步安装(把正本刷到各发现目录)

```bash
node scripts/install_skill.js                  # 项目级: .agents/skills/
node scripts/install_skill.js --user           # 用户级: ~/.agents/skills/ (所有项目可用)
node scripts/install_skill.js --target <dir>   # 安装到其他项目根
node scripts/install_skill.js --check          # 校验全部目标与正本零漂移
```

跨项目/用户级安装时知识库通过 `COURSEWARE_KNOWLEDGE_DIR` 环境变量指向本仓库 `plugin/knowledge/`
(或整仓克隆, kb_locate 会自动向上查找)。

### 依赖

Node.js 18+; 执行 `npm install` 安装依赖 (`pptxgenjs`, `ajv`, `js-yaml`)。

字体:渲染时会探测本机实际可用的中文字体名写入 pptx,避免未装「微软雅黑」时
PowerPoint / LibreOffice 二次回退造成排版错位。需要严格「同输入恒同输出」时,
用 `COURSEWARE_FONT=Microsoft YaHei` 固定字体名。

## 四、老师怎么用(示例指令)

| 学科 | 指令示例 | 产出 |
|---|---|---|
| 数学 | 帮我做三年级上册第四单元第1课时的课件 | 口算乘法:算理分步+竖式图元+易错警示+分层练习 |
| 语文 | 做《铺满金色巴掌的水泥道》的课件 | 田字格生字+拼音行+多音字辨析+词语理解方法 |
| 英语 | 做四年级上册 Unit 1 Part A 的课件 | 对话气泡+职业词卡+句型操练+自评小结 |

修订只需说"把练习第2题换成判断题"——Skill 改 JSON → 重校验 → 重渲染,全部页面同步更新。

## 五、质量门禁速览

| 门禁 | 拦截内容 |
|---|---|
| Tier 1 | Schema 违规、缺必填字段、缺讲稿/讲稿过短、教学环节不闭环(导入/探究/应用/总结)、目标引用悬空 |
| Tier 2 | 引用素材包外知识点(POINT_ID_INVALID)、知识库单元定位失败(KB_UNIT_NOT_FOUND, fail-closed) |
| Tier 3 | 数学数字超数域上界(NUMERIC_UPPER_BOUND_EXCEEDED, 递归覆盖 content_block 全字段)、算式真值错误(MATH_CALCULATION_ERROR)、教学边界红线(SCOPE_EXCLUDED_VIOLATION) |
| 渲染后 | `.audit.json` 几何体检:画布越界、文字溢出裁切、文本互相压盖;`--strict` 下 critical 拒绝交付 |
| 动效后 | `p:transition` 必须先于 `p:timing`;顺序错误或注入失败时回执 `reveal` 字段记录每页步数 |
| 算理动画 | 声明式参数数学门禁前置(起点+跳跃总和≠目标直接拒绝);FFmpeg 缺失自动降级静态卡 |

`--quiet` 只精简修复提示,**不会隐藏 warnings**(如媒体文件缺失、动态媒体未接入、讲稿中的疑似超纲数)。

核验状态如实呈现:verified 可放心使用;partial 渲染时页脚自动附"使用前请核对"。

## 六、验证与验收

```bash
npm test                              # 单元+契约+快照 + 金样端到端 + 知识库结构审计
# 只跑其中一类:
npm run test:unit                     # node:test 单元 + 双 AST 契约 + AST 快照
npm run test:acceptance               # 金样端到端, 报告写入 output/reports/
npm run test:matrix                   # 6 金样 x 5 套风格包 (30 套, 断言 0 Critical)

node plugin/skills/lesson-courseware/scripts/build_courseware.js \
    --input <lesson_plan.json> --outdir <输出目录> --strict [--style warm] [--no-skeleton-fill] [--json]
```

`npm test` 对每个金样断言:一键流水线退出码 0、三件套产物齐备、
**几何审计 0 critical**、**内容页讲稿完备**、**分步时序 orderValid**;
并对金样 LessonPlan / Presentation AST 做 JSON Schema 契约校验、对规划产物做结构快照回归、
对知识库做「核心 YAML 可解析 + point_id 全局唯一」结构审计。
风格矩阵单独用 `npm run test:matrix` 跑(每份金样 x 5 套风格包),
确认换肤不会把任何一页撑破。报告在 `output/reports/acceptance-report.md`。

### 课型骨架

`meta.lesson_type` 决定这节课的教学法结构,不只是个标签:

| 课型 | 骨架 | 收尾页 |
|---|---|---|
| `concept_learning` 新授课 | 情境导入 → 核心探究 → 例题示范 → 易错辨析 → 当堂练习 → 课堂小结 | — |
| `practice_consolidation` 练习课 | 复习唤醒 → 基础练习 → 变式练习 → 错因诊断 → 课堂小结 | 分层作业 |
| `unit_review` 复习课 | 知识网络 → 专题精练 → 错因诊断 → 课堂小结 | 板书结构 + 分层作业 |
| `experiment_inquiry` 实验课 | 问题情境 → 实验操作 → 应用迁移 → 课堂小结 | 分层作业 |
| `reading_comprehension` 阅读课 | 情境导入 → 字词梳理 → 文本品读 → 研读思辨 → 当堂练习 → 课堂小结 | — |

缺失必备环节时补一页"待补充"占位页并在构建日志告警,补不出内容就明示;
缺口比已覆盖环节还多时判为片段式课件,只诊断不补页。系统**不重排**教师已定的教学序列,
顺序偏离只给提示。`--no-skeleton-fill` 可关闭补齐。

### 风格包

课件长相由 `--style`(或教学设计里的 `meta.style`)决定,共 5 套:

| 风格包 | 名称 | 特征 | 建议场景 |
|---|---|---|---|
| `clean` | 清爽白 | 白底细描边、顶部主色条、圆角轻投影 | 默认、日常课 |
| `warm` | 暖阳 | 米杏底、左侧强调色带、大圆角、暖橙点睛 | 低中段、公开课 |
| `academic` | 学术 | 纯白净底、直角细线、标题下压重线、封面左文右栏 | 高段、复习课 |
| `minimal` | 极简 | 黑白灰、无圆角无投影、上下发丝线 | 家长会、汇报 |
| `chalk` | 板书手账 | 米黄纸底、墨绿书脊、虚线页脚与下划线标题 | 板书型课、听课记录 |

风格包只改配色、圆角、页眉装饰、封面构图与字号节奏,**不动任何卡槽坐标**,
所以 5 套风格共用同一套几何门禁与验收矩阵。

> 单元测试覆盖契约校验、教学门禁(数域/禁区/算式真值)、文本度量与折行、
> 几何审计、放映分步、风格包 token 与对比度;渲染规则变更请同步补单测与金样。

> 边界声明:自动化门禁只判定"可结构化"的项目;课件内容的教学正确性须经教师人工审核。
> 本项目与原练习生成项目共用一套诚实原则:**绝不把"生成成功"当作"内容正确"**。

## 七、评测(evals)

LLM-as-judge 协议见 [evals/README.md](evals/README.md):P(教学设计)/R(学科严谨)/O(输出契约)/
M(模型脚手架)四桶逐条 0/1 判分,`rubrics/{shared,math,chinese,english}.csv`,
M 桶对照对话过程、其余对照产出物;partial 场景必须验证"如实告知"行为。

## 八、许可

本项目以 **Apache License 2.0** 发布,全文见 [LICENSE](LICENSE)。
可自由用于商业场景,须保留版权声明与 [NOTICE.md](NOTICE.md) 中的来源归属。

三方归属:插件工程架构借鉴 [anthropics/k12-teacher-skills](https://github.com/anthropics/k12-teacher-skills)(Apache-2.0),
知识库事实层 vendored 自同工作区的 `primary-school-practice-skill`,详见 NOTICE。
教材内容的著作权归人民教育出版社,本仓库仅存放结构化教学事实,不含任何教材/教参扫描件。
