# 课件生成评测框架 (LLM-as-Judge)

架构借鉴 [anthropics/k12-teacher-skills](https://github.com/anthropics/k12-teacher-skills) 的评测协议,针对课时 PPT 课件场景改造。

## 评测对象

课件生成全链路(对话过程 + 产出物两部分):
- **对话过程**:宿主模型是否按 SKILL.md 工作流执行(取材、溯源、校验自愈、如实告知)——由 M 桶标准判;
- **产出物**:lesson_plan.json(教学设计)与渲染出的 .pptx 内容质量——由 P/R/O 桶判。

## Rubric 结构

`rubrics/` 下 CSV,统一列:`ID,Bucket,Criterion,What pass requires,Notes,Conditional`

- **Bucket**:P=教学设计(Pedagogy) R=学科严谨(Rigor) O=输出契约(Output) M=模型脚手架(Model Scaffolding)
- **每条独立 0/1 判分**,不合并;优先看逐条通过率(聚合通过率会掩盖短板)。
- **Conditional**:如 `有竖式页`、`低年级(1-2)`、`含古诗`;条件不满足时该条**跳过(不计失败)**。

## 跑法(手动,配合既有 eval 框架)

1. 用被测 skill 生成课件(保留对话记录 + lesson_plan.json + .pptx);
2. 给评审 LLM 两类输入:(a) 对话记录 + lesson_plan.json;(b) rubric CSV(shared + 对应学科);
3. 评审系统提示词(必须包含):

> 按 CSV 逐条判定。M 桶(M 开头 ID)对照**对话记录**判定;其余桶对照**教学设计 JSON 与页面内容**判定。`Conditional` 条件不满足时跳过该条(不计失败)。只输出合法 JSON 数组,不要输出其他任何内容。

4. 评审输出格式(强制):

```json
[{"id": "P1", "pass": true, "explanation": "一句话依据"},
 {"id": "R1", "pass": false, "explanation": "一句话依据"}]
```

## rubric 文件

| 文件 | 适用 |
|---|---|
| `rubrics/shared.csv` | 所有学科通用 |
| `rubrics/math.csv` | 数学课件追加 |
| `rubrics/chinese.csv` | 语文课件追加 |
| `rubrics/english.csv` | 英语课件追加 |

例:三年级数学课件 → `shared.csv` + `math.csv`。

## 建议的基准场景

`acceptance/cases.yaml` 内置三科各 1 个金样场景;扩展时按"学科 × 年级段 × 核验状态(verified/partial)"抽样,partial 场景必须验证"如实告知"行为(M2)。
