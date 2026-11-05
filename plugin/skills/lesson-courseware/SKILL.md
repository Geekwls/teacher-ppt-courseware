---
name: lesson-courseware
description: >-
  人教统编版课时 PPT 课件生成专家(小学1~6年级语数英全覆盖 + 初中一年级语文试点篇目)。当教师请求"做课件 / 做 PPT / 生成幻灯片 /
  备课课件",或给出"年级+学科+单元/课文"并希望产出课堂演示文稿时使用本技能,
  如"帮我做三年级上册数学第四单元第1课时的课件""做初一语文《春》的PPT"。
  基于五层教材知识库(教材例题+教参重难点易错点),产出可编辑 .pptx(含教师讲稿备注与参考答案页)。
  仅用于课时课件;练习卷/试卷生成、教案文档、评分标准等需求不适用本技能。
---

# 人教统编版中小学课时 PPT 课件生成 (Lesson Courseware)

Agent-Native 现代分层架构:**宿主大模型即教学设计与内容创作引擎**,本工程提供四大支柱:
1. **教材证据提供者** —— 五层知识库:教材例题原文(lessons)、知识点/教学目标/边界(knowledge_points)、教参重难点/典型错因/变式策略(teaching_reference);
2. **教学设计规范与门禁 (LessonPlan AST)** —— 大模型只需专注纯教学逻辑(教学目标、导入、探究、易错剖析、随堂练习、板书总结)，彻底脱离幻灯片物理坐标与排版束缚;
3. **表现智能规划器 (PagePlanner)** —— 先按课型骨架 (`meta.lesson_type`: 新授/练习/复习/实验/阅读) 确定必备环节与收尾页,缺失必备环节补"待补充"占位页并告警;再依据学段认知阶梯(防近视大字号、低密度)与学科策略(田字格、数轴模型、对话卡片),自动执行容量评估拆页、练习与答案分离拆页,并装配 OpenXML 单击淡入时间线;
4. **一键确定性渲染与严格几何体检** —— PptxGenJS 把 Presentation AST 渲染成 16:9 可编辑 .pptx，注入全屏单击动画，并通过 `--strict` 门禁保证 0 压盖、0 出界的工业级交付。

你要做的事:取材 → 编写教学设计 (LessonPlan AST) → 一键流水线构建交付。**不直接生成 pptx 二进制，不手写幻灯片坐标**。

## 标准五步工作流 (Standard 5-Step Loop)

```
[教师自然语言指令]  "帮我做三年级上册数学第四单元第1课时的课件"
        │
【Step 0 静默路由】识别 学科/年级/册次/单元/课时;先读 references/workflow.md
        │
【Step 1 澄清】最多问 2 个问题(课型/课时范围/风格偏好);信息明确则直接默认推进
        │          课型问法示例:"这节是新授课、练习巩固课还是单元复习课?"(不答则按知识点性质判断)
        │          风格偏好问法示例:"想要清爽白、暖阳、学术、极简还是板书手账?"(不答则 clean)
        │
【Step 2 取材】node scripts/query_curriculum.js 拉取课时素材包(必做,禁止跳过)
        │
【Step 3 创作教学设计】按 references/schemas/lesson-plan.schema.json 写 lesson_plan.json
        │               (仅编写教学设计、情境设问、算理/字词/对话、典型错例、练习题与板书)
        │
【Step 4 一键流水线交付】node scripts/build_courseware.js --input <lesson_plan.json> --outdir output [--style warm]
        │                 (自动全串联: 教学门禁 -> 课型骨架补齐 -> 容量规划 -> 表现门禁 -> 确定性渲染 -> 原生动效注入 -> 几何审计)
        │
【Step 5 汇报交付】向教师汇报课件页数、依据的教材知识点、各页原生单击分步动画与几何体检结果
        │
【Step 6 迭代】改内容 = 只修改 lesson_plan.json 对应教学字段 -> 重跑 Step 4(绝不手改 pptx)
```

各步细则见 `references/workflow.md`;分层架构规范见 `references/modular-architecture.md`;学科差异见 `references/{math,chinese,english}-rules.md`;动态演示与微课扩展规范见 `references/dynamic-media-architecture.md`。

## 五条纪律(违反即返工)

1. **先取材,后创作**:Step 2 必须先运行 query_curriculum.js 获取课时素材包。教学设计的例题、重难点、易错点只能引用素材包真实存在的 `point_id`，禁止臆造。
2. **不超纲与边界防线**:数学所有数字受单元数域上界 (`numeric_upper_bound`) 约束;三科内容都严禁越过知识点的教学禁区 (`teaching_boundary.scope_excluded`);素材库未涵盖的后续公式严禁提前出现。
3. **教师讲稿指导完备**:教学环节必须包含详实的 `teacher_guidance` (实际课堂教学提问、过渡指令与朗读引导)，系统自动编译进 PPT 备注栏。缺指导语教学门禁一票否决。
4. **不手写幻灯片坐标**:一律按 `references/schemas/lesson-plan.schema.json` 创作教学设计 AST，由 `build_courseware.js` 执行容量规划、门禁与确定性渲染，绝不直接手写 PPTX 二进制或手工排坐标。
5. **严格几何体检交付**:交付前体检回执必须满足 `--strict` 几何门禁 (0 Critical 零压盖零出界)，任何版面重叠或文字溢出必须优先优化教学设计结构后重跑流水线。

## 知识库覆盖现状(如实告知,禁止夸大)

- 规模:158 单元 / 557 知识点;核验状态 verified 79 单元、partial 79 单元。
- 学段:小学 1~6 年级语数英(英语为人教版三年级起始);**初中仅收录初一语文上册第一单元(试点)**,初二/初三与初中数学、英语均未建库。
- 学期缺口(11 个):语文 g3/g4/g5/g6 下册、g8、g9;数学 g4/g5/g6 下册;英语 g3~g6 下册。
- 教师点到未覆盖的年级/单元时,必须走 `status=not_found` 如实说明并给出最近的可覆盖单元,**不得**用训练知识冒充教材内容。

## 保持教师知情 (Keeping the teacher posted)

- Step 2 取材后:用一句话报告"已定位:XX年级XX册第X单元《…》第X课时,知识库状态 verified/partial,含 N 个知识点、M 条教参易错提示"。
- Step 5 交付时:报告文件路径、总页数(含自动答案页)、依据的知识点与教材页码;partial 状态必须附"使用前请核对"提醒。
- 迭代时:先改 JSON 的哪个字段、为什么,一句话说明,再重渲染。

## 版权护栏

课文引文限于教学所需片段(生字所在句、精读段),不整页整课抄录;教材例题转述+页码溯源;教参内容(重难点/错因)做教学化转写,不逐字照搬。

## 课件修订与技能更新机制 (Revisions & Skill Updates)

### 1. 课件内容增量修订 (Content Patching)
教师提出修改意见时（例如“第2题换一下”、“修改第3页设问”、“更新教师讲稿”）：
- **绝对不手改 PPTX 二进制**；
- 运行增量补丁工具定向修改对应教学环节：
  ```bash
  node scripts/patch_courseware.js --input <lesson_plan.json> --phase <phase_id> --notes "新讲稿"
  # 或传入 patch.json:
  node scripts/patch_courseware.js --input <lesson_plan.json> --patch <patch.json>
  ```
- 自动更新 LessonPlan AST、重新规划与体检，保持其余未修改页面的布局与动画零漂移。

### 2. Skill 工具集自身的同步与版本更新 (Skill Self-Update)
当本技能发布新版本或多 Agent 运行环境需要同步时：
- **检查漂移与更新**：`npm run check-skill` (或 `node scripts/update_skill.js --check`)
- **一键增量同构同步**：`npm run update-skill` (自动同步至正本与受控 Agent 目录)
- **从 GitHub 远端拉取最新**：`npm run pull-skill` (自动拉取 main 分支并同步)
- **更新至用户全局 Agent 目录**：`node scripts/update_skill.js --user`

