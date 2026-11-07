# 工作流细则 (workflow)

## Step 0 —— 静默路由(不动声色,先做完再开口)

从教师指令中识别五元组:学科(math/chinese/english)、年级(1-6)、册次(term-1上/term-2下)、单元、课时。
- 学科判定:数学/语文/英语;英语通常是 PEP 3~6 年级。
- 课时语义:**数学按课时序号**(第1课时…),**语文/英语按课文序号**(第5课/Part A)。教师说"第2课时"而该科按课文编号时,取材包会返回 lessons_index,从中按课文内容判断,不要硬套数字。
- 指令含糊(只说"做口算乘法的课件"):用 `--search "口算乘法"` 跨库检索后再确认。

## Step 1 —— 澄清(最多 2 问,能默认则默认)

| 情形 | 默认 | 仍要问的情形 |
|---|---|---|
| 课时范围 | 单课时 | 教师说"整个单元"→ 逐课时各出一份,先出第一份对齐风格 |
| 风格 | standard(扎实讲授型) | 教师明确要"活动多/情境化"→ innovative |
| 封面署名 | 留空 | 教师报了姓名/学校则写入 metadata |

确认五元组后,向教师一句话复述定位,再进入取材。

## Step 2 —— 取材(必做)

```bash
cd <skill目录>/plugin/skills/lesson-courseware   # 即本 references 的上级目录
node scripts/query_curriculum.js --prompt "三年级上册数学第四单元第1课时"
# 或结构化参数
node scripts/query_curriculum.js --subject math --grade 3 --term term-1 --unit unit-4 --lesson 1
```

素材包字段速览:
- `lesson.official_examples`:教材例题原文+页码+核心算理 —— 例题页的素材
- `knowledge_points[]`:point_id / point_name / learning_objectives / teaching_boundary(scope_allowed/scope_excluded)/ provenance.page_ref
- `teaching_reference[]`:key_point / difficulty / **typical_misconceptions(错例+错型)** / variation_strategy —— 易错页与变式练习的素材
- `question_blueprint_summary`:练习蓝图(题型/题量/难度配比) —— 课堂练习的配比参考
- `unit.numeric_upper_bound`:数学数域硬上界(lesson_validator 会递归扫描 content_block 全字段)
- `unit.verification_status`:verified / partial

**知识库未覆盖(not_found)**:如实告诉教师"该册该单元暂未建库",可改为教师贴教材内容共建,但 curriculum_status 如实标 missing,不得假造页码。

## Step 3 —— 创作教学设计(读 lesson-plan.schema.json 后写 LessonPlan JSON)

写**纯教学逻辑**(教学目标、导入、探究、易错剖析、随堂练习、板书总结),不写任何幻灯片坐标/字号/页型——页面编排由 PagePlanner 按学段认知与学科策略自动完成。

- 契约:`references/schemas/lesson-plan.schema.json`
- 金样参考:`acceptance/lesson_plans/*.json`(三科六份,覆盖新授/练习/复习三种课型)
- 学科特化规则**必读**:math-rules.md / chinese-rules.md / english-rules.md(Step 0 阶段就应读完对应学科文件,跳过是关键失败)
- `meta.source_point_id` 必须来自素材包的知识点白名单
- 每个环节 `teacher_guidance` 写讲稿:提问语、过渡语、学生活动指令、易错追问,不写"此处讲解"这类空话
- 数学探究环节的 `model_payload` 支持两种模型:
  - 数轴模型 `{start, end, step, arcs[]}`(矢量图元);
  - 声明式算理动画 `{kind:"animation", animation_type:"number_line_jump"|"vertical_calc_flow", parameters:{...}}`(渲染前现场合成视频,数学门禁前置校验,FFmpeg 缺失时自动降级为静态要点卡)。

### 先定课型,再写环节 (`meta.lesson_type`)

`lesson_type` 不是标签,它决定这节课的**教学法骨架**:必备环节、页序、收尾页。写环节前先对照下表,否则会缺环节(系统会补"待补充"占位页,但补不出内容)。

| `lesson_type` | 课型 | 骨架(→ 为页序) | 收尾页 |
|---|---|---|---|
| `concept_learning` | 新授课 | 情境导入 → 核心探究 → 例题示范 → 易错辨析 → 当堂练习 → 课堂小结 | — |
| `practice_consolidation` | 练习巩固课 | 复习唤醒 → 基础练习 → 变式练习 → 错因诊断 → 课堂小结 | 分层作业 |
| `unit_review` | 单元复习课 | 知识网络 → 专题精练 → 错因诊断 → 课堂小结 | 板书结构 + 分层作业 |
| `experiment_inquiry` | 实验探究课 | 问题情境 → 实验操作 → 应用迁移 → 课堂小结 | 分层作业 |
| `reading_comprehension` | 阅读指导课 | 情境导入 → 字词梳理 → 文本品读 → 研读思辨 → 当堂练习 → 课堂小结 | — |

- **必备 vs 可选**:上表未标注的均为必备环节,缺失即补占位页并告警;例题示范、易错辨析、字词梳理为可选(语文课没有例题页是正常的)。
- **等价角色**:语文/英语课用"文本品读"承担数学"核心探究"的职能,不会被判缺探究。
- **不重排**:系统只诊断顺序、补缺口,绝不擅自重排老师写好的教学序列;顺序偏离只给提示。
- **片段式设计**:若缺口比已覆盖环节还多(例如只想生成某个品读片段),判为局部课件,只诊断不补页。
- **收尾页**只在对应课型出现,内容从已规划页面聚合(板书取小结要点与正解,作业按目标分层),不新编教材事实。

## Step 4 —— 一键构建交付(校验/规划/渲染全内置)

```bash
node scripts/build_courseware.js --input <lesson_plan.json> --outdir <输出目录> --strict [--style <风格包>] [--no-skeleton-fill]
```

自动串联:教学门禁(知识点归属/数域/算式真值/讲稿完备) → 课型骨架诊断与补齐 → 容量规划拆页 → 表现门禁 → 确定性渲染 → 原生动效注入 → `--strict` 几何体检(存在 Critical 即退出码 1 拒绝交付)。

构建日志会打印骨架回执(`ℹ 课型骨架: …`),缺环节时给出 `⚠ 缺失必备环节: …` 并说明已补占位页;`--no-skeleton-fill` 可关闭补齐、只保留诊断。

### 风格包 (`--style` / `meta.style`)

5 套风格包只改变**配色、圆角、页眉装饰、封面构图与字号节奏**,不动任何卡槽坐标,因此任意风格都走同一套几何门禁。优先级:`--style` > `meta.style` > `clean`。

| 风格包 | 名称 | 视觉特征 | 建议场景 |
|---|---|---|---|
| `clean` | 清爽白 | 白底细描边、顶部主色条、圆角轻投影 | 默认、日常课 |
| `warm` | 暖阳 | 米杏底、左侧强调色带、大圆角、暖橙点睛 | 低中段、公开课 |
| `chalk` | 板书手账 | 米黄纸底、墨绿书脊、虚线页脚与下划线标题 | 板书型课、听课记录 |

> 为什么不提供深色黑板风格:渲染器里的语义底色(答案绿/错例红/提示黄)都按"浅底深字"设计,真黑底会让这些卡片的深色文字失去对比。`chalk` 用米黄纸 + 墨绿墨迹来表达板书质感,保持全部语义色可读。

也可单独校验教学设计:

```bash
node scripts/validate_lesson_plan.js --input <lesson_plan.json>
```

按 `errors[].code` 定向修复:POINT_ID_INVALID=知识点不在本单元白名单;NUMERIC_UPPER_BOUND_EXCEEDED=数字超纲,改数;MATH_CALCULATION_ERROR=算式算错;TEACHER_GUIDANCE_REQUIRED=补讲稿。**只改教学字段,不动 phase_id/type**。修完重跑,直至 `"status": "pass"`。

交付话术模板:
> 课件已生成:`<路径>`(共 N 页,其中含练习参考答案页)。
> 依据:人教版X年级上册第X单元《…》第X课时(知识点 A/B/C,教材 P__)。
> 教师讲稿在各页备注栏;练习答案在每页练习后的"参考答案"页;各页含单击分步放映。
> (partial 时)本单元知识库为部分核验状态,请课前对照教材核对内容。

## Step 5 —— 迭代

改 lesson_plan.json → 重跑 build_courseware,一气呵成,同轮交付。常见迭代:换例题情境、增删练习题、更新讲稿、调整 `model_payload`。也可用增量补丁工具:

```bash
node scripts/patch_courseware.js --input <lesson_plan.json> --phase <phase_id> --notes "新讲稿"
```
