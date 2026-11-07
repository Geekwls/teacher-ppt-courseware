# content/lesson_plans — 教学设计源（内容资产）

这里存放**真实交付给教师使用的课件源文件**（LessonPlan AST JSON）。课件 =
这里的 JSON 经 `build_courseware.js` 确定性渲染而成；改课件内容 = 改对应 JSON
的教学字段后重跑构建，其余页面布局与动画零漂移。

## 目录组织

按学科分域：`math/`、`chinese/`、`english/`。

## 命名规范

```
文件名:  {subject}_g{年级}_t{册1|2}_u{单元02d}_l{课时02d}[_slug]_lesson_plan.json
lesson_id: {subject}-g{年级}-t{册}-u{单元02d}-l{课时02d}   （与文件名一一对应）
```

`_slug` 仅用于区分同一课时的多个版本（如 `_warm` 暖阳风格版、`_demo` 演示版）。

## 准入纪律

- **只有准备交付给教师使用的教学设计才进这里**；临时试验请放 `output/`，不污染内容资产。
- 创作前必须先 `query_curriculum.js` 取材，内容只能引用素材包返回的 `point_id`
  （详见仓库根 AGENTS.md 的五条纪律）。
- 教学设计必须通过 `lesson-plan.schema.json` 契约与教学门禁（构建时自动校验）。

## 与 acceptance/ 的关系

`acceptance/lesson_plans/` 是回归金样（只读测试夹具），不是这里的备份。
一份教学设计被确认为"必须永远生成正确"的形态后，才**复制**进 acceptance 并
生成 AST 快照（晋级），原文件仍留在本目录继续迭代。
