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

Agent-Native 架构:**宿主大模型即教学设计与内容创作引擎**,本工程提供三样东西:
1. **教材证据提供者** —— 五层知识库:教材例题原文(lessons)、知识点/教学目标/边界(knowledge_points)、教参重难点/典型错因/变式策略(teaching_reference);
2. **确定性裁判门禁** —— 校验器拦截超纲数域、伪造知识点引用、缺讲稿、结构错误;
3. **确定性渲染引擎** —— python-pptx 把课件 JSON 渲染成 16:9 可编辑 .pptx(防近视大字号、田字格/竖式/数轴/词卡等原生图形、讲稿进备注栏、练习自动升页+参考答案页)。

你要做的事:取材 → 教学设计创作 → 写课件 JSON → 校验自愈 → 调渲染器。**不直接生成 pptx 二进制**。

## 标准五步工作流 (Standard 5-Step Loop)

```
[教师自然语言指令]  "帮我做三年级上册数学第四单元第1课时的课件"
        │
【Step 0 静默路由】识别 学科/年级/册次/单元/课时;先读 references/workflow.md
        │
【Step 1 澄清】最多问 2 个问题(课时范围/风格偏好);能默认则默认
        │
【Step 2 取材】python scripts/query_curriculum.py 拉取课时素材包(必做,禁止跳过)
        │
【Step 3 创作】按 references/courseware-json.md 写 courseware.json
        │        (教学目标/导入/新知分步/例题溯源/易错警示/分层练习/小结/板书/作业)
        │
【Step 4 校验自愈】python scripts/validate_courseware.py;失败按修复提示定向修改,直至 pass
        │
【Step 5 渲染交付】bash scripts/render_all.sh → .pptx;向教师报告页数/依据/注意事项
        │
【Step 6 迭代】改内容 = 先改 JSON → 重校验 → 重渲染(绝不手改 pptx)
```

各步细则见 `references/workflow.md`;学科差异见 `references/{math,chinese,english}-rules.md`。

## 五条纪律(违反即返工)

1. **先取材,后创作**:Step 2 没跑 query_curriculum.py 就动笔,是本技能的第一失败模式。课件的例题、重难点、易错点必须来自素材包,并逐页用 `source.point_id` 溯源。
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

## 修订 (Revisions)

教师要求修改时:**只改 courseware.json 中对应内容字段**(保持 slide_id/type 稳定),重跑 Step 4-5。所有页面由同一份 JSON 派生,不会出现"改了卷面忘了备注"的漂移。
