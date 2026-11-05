---
name: lesson-courseware
description: >-
  小学人教版课时 PPT 课件生成专家(语数英三科)。当教师请求"做课件 / 做 PPT / 生成幻灯片 /
  备课课件",或给出"年级+学科+单元/课文"并希望产出课堂演示文稿时使用本技能,
  如"帮我做三年级上册数学第四单元第1课时的课件""做《秋天的雨》的PPT"。
  基于五层教材知识库(教材例题+教参重难点易错点),产出可编辑 .pptx(含教师讲稿备注与参考答案页)。
  仅用于课时课件;练习卷/试卷生成、教案文档、评分标准等需求不适用本技能。
---

# 小学课时 PPT 课件生成 (Lesson Courseware)

Agent-Native 现代分层架构:**宿主大模型即教学设计与内容创作引擎**,本工程提供四大支柱:
1. **教材证据提供者** —— 五层知识库:教材例题原文(lessons)、知识点/教学目标/边界(knowledge_points)、教参重难点/典型错因/变式策略(teaching_reference);
2. **教学设计规范与门禁 (LessonPlan AST)** —— 大模型只需专注纯教学逻辑(教学目标、导入、探究、易错剖析、随堂练习、板书总结)，彻底脱离幻灯片物理坐标与排版束缚;
3. **表现智能规划器 (PagePlanner)** —— 依据学段认知阶梯(防近视大字号、低密度)与学科策略(田字格、数轴模型、对话卡片)，自动执行容量评估拆页、练习与答案分离拆页，并装配 OpenXML 单击淡入时间线;
4. **一键确定性渲染与严格几何体检** —— PptxGenJS 把 Presentation AST 渲染成 16:9 可编辑 .pptx，注入全屏单击动画，并通过 `--strict` 门禁保证 0 压盖、0 出界的工业级交付。

你要做的事:取材 → 编写教学设计 (LessonPlan AST) → 一键流水线构建交付。**不直接生成 pptx 二进制，不手写幻灯片坐标**。

## 标准五步工作流 (Standard 5-Step Loop)

```
[教师自然语言指令]  "帮我做三年级上册数学第四单元第1课时的课件"
        │
【Step 0 静默路由】识别 学科/年级/册次/单元/课时;先读 references/workflow.md
        │
【Step 1 澄清】最多问 2 个问题(课时范围/风格偏好);信息明确则直接默认推进
        │
【Step 2 取材】node scripts/query_curriculum.js 拉取课时素材包(必做,禁止跳过)
        │
【Step 3 创作教学设计】按 references/schemas/lesson-plan.schema.json 写 lesson_plan.json
        │               (仅编写教学设计、情境设问、算理/字词/对话、典型错例、练习题与板书)
        │
【Step 4 一键流水线交付】node scripts/build_courseware.js --input <lesson_plan.json> --outdir output
        │                 (自动全串联: 教学门禁 -> 容量规划 -> 表现门禁 -> 确定性渲染 -> 原生动效注入 -> 几何审计)
        │
【Step 5 汇报交付】向教师汇报课件页数、依据的教材知识点、各页原生单击分步动画与几何体检结果
        │
【Step 6 迭代】改内容 = 只修改 lesson_plan.json 对应教学字段 -> 重跑 Step 4(绝不手改 pptx)
```

各步细则见 `references/workflow.md`;分层架构规范见 `references/modular-architecture.md`;学科差异见 `references/{math,chinese,english}-rules.md`;动态演示与微课扩展规范见 `references/dynamic-media-architecture.md`。

## 五条纪律(违反即返工)

1. **先取材,后创作**:Step 2 没跑 query_curriculum.js 就动笔,是本技能的第一失败模式。课件的例题、重难点、易错点必须来自素材包,并逐页用 `source.point_id` 溯源。
2. **不超纲**:数学一切数字受单元数域上界约束;三科内容都不得越过 knowledge_points 的 teaching_boundary.scope_excluded;素材没给的后续知识(如下一章公式)不得提前出现。
3. **讲稿完备**:每个内容页 notes 写"课堂上实际要说的话与提问",渲染进备注栏,教师拿去能直接上课。缺 notes 校验器一票否决。
4. **如实标注证据**:curriculum_status 如实引用素材包值;verified/partial 的差异要告知教师;绝不虚构教材页码——写不准就不写页码。
5. **一次请求 = 一次完整交付**:校验+渲染在**同一轮**完成;教师拿到手的是可直接放映的 .pptx,不是半成品。

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
