# 数学课件规则 (math-rules)

Step 0 判定为数学后,先读本文件再创作。

## 1. 算理优先

- 新知页(concept)必须"算理 → 算法"两段式:先讲"为什么"(计数单位/数的组成/直观模型),再提炼"怎么算"(callout 高亮口算/笔算方法)。
- 算理表述忠于素材包 `lesson.official_examples.core_concept` 与 `teaching_reference.key_point`,不自行发明说法。
- 分步 steps 每步一句话,能配图元的配图元。

## 2. 图元使用(figure)

| 场景 | 用法 |
|---|---|
| 笔算竖式 | `vertical_calc`(数位自动对齐);教学初 `show_result:false` 让学生先试,下一页/例题页再给结果 |
| 数的组成/数形结合 | `place_value` 数位表(千/百/十/个) |
| 递推规律 | `number_line`(marks 标注关键点) |
| 情境主题图数据 | `table`(价目表/统计表) |
| 口算过程 | 文本 steps 内嵌"(  )个十"表述,不必强行图示 |

- 图元与题干中出现的**所有数**不得超 `unit.numeric_upper_bound`(校验器拦截)。
- 竖式教学要一次进位、连续进位分层递进,不混合出题。

## 3. 例题页(example)

- 优先用教材例题(official_examples),保留原情境名(如"坐过山车问题"),`source.textbook_page` 如实填。
- solution_steps 呈现"理解题意 → 列式 → 算理分步 → 回答"四段;answer 带单位和完整答句。

## 4. 易错页(misconception)

- 错例直接采用 `teaching_reference.typical_misconceptions[].error_pattern`(如 50×6=30 漏添末尾0),reason 讲清错型(漏添0/漏加进位/先加后乘),correct 给正解。
- notes 里设计"让学生当小老师找错"的追问链。
- 一课时 1~2 个易错点,选教参标注的高频错因。

## 5. 课堂练习(practice)

- 配比参考 question_blueprint_summary:基础:变式:挑战 ≈ 6:3:1;每题标 source.point_id。
- 题型多样:口算组、判断/选择(带 options)、情境应用、找规律填空。
- 答案必填(answer 字段),渲染进自动答案页;挑战题答案可附一句思路提示。

## 6. 板书(board)

三行结构:课题+核心算式区 / 方法提炼句 / 易错警示角。用 content 多行文本,`└`、`→` 等符号可用。
