# 工作流细则 (workflow)

## Step 0 —— 静默路由(不动声色,先做完再开口)

从教师指令中识别五元组:学科(math/chinese/english)、年级(1-6)、册次(term-1上/term-2下)、单元、课时。
- 学科判定:数学/语文/英语;英语通常是 PEP 3~6 年级。
- 课时语义:**数学按课时序号**(第1课时…),**语文/英语按课文序号**(第5课/Part A)。教师说"第2课时"而该科按课文编号时,取材包会返回 lessons_index,从中按课文内容判断,不要硬套数字。
- 指令含糊(只说"做口算乘法的课件"):用 `--search "口算乘法"` 跨库检索后再确认。

## Step 1 —— 澄清(最多 2 问,能默认则默认)

| 情形 | 默认 | 仍要问的情形 |
|---|---|---|
| 课时范围 | 单课时 | 教师说"整个单元"→ 逐课时各出一份 deck,先出第一份对齐风格 |
| 风格 | standard(扎实讲授型) | 教师明确要"活动多/情境化"→ innovative |
| 封面署名 | 留空 | 教师报了姓名/学校则写入 metadata |

确认五元组后,向教师一句话复述定位,再进入取材。

## Step 2 —— 取材(必做)

```bash
cd <skill目录>/plugin/skills/lesson-courseware   # 即本 references 的上级目录
python scripts/query_curriculum.py --prompt "三年级上册数学第四单元第1课时"
# 或结构化参数
python scripts/query_curriculum.py --subject math --grade 3 --term term-1 --unit unit-4 --lesson 1
```

素材包字段速览:
- `lesson.official_examples`:教材例题原文+页码+核心算理 —— 例题页的素材
- `knowledge_points[]`:point_id / point_name / learning_objectives / teaching_boundary(scope_allowed/scope_excluded)/ provenance.page_ref
- `teaching_reference[]`:key_point / difficulty / **typical_misconceptions(错例+错型)** / variation_strategy —— 易错页与变式练习的素材
- `question_blueprint_summary`:练习蓝图(题型/题量/难度配比) —— 课堂练习的配比参考
- `unit.numeric_upper_bound`:数学数域硬上界
- `unit.verification_status`:verified / partial

**知识库未覆盖(not_found)**:如实告诉教师"该册该单元暂未建库",可改为教师贴教材内容共建,但 curriculum_status 如实标 missing,不得假造页码。

## Step 3 —— 创作(读 courseware-json.md 后写 JSON)

标准结构(单课时 12~18 页):

```
cover → objectives(3条) → warmup(复习/情境导入)
→ concept(算理/新知,分步,可配图元) → example(教材例题,溯源) → concept/example(变式递进)
→ misconception(教参高频错因,1~2页)
→ practice(4~6题,基础:变式:挑战≈6:3:1,蓝图配比优先)
→ summary(3条) → board(板书设计) → homework(2~3项,分层) → end
```

- 学科特化规则**必读**:math-rules.md / chinese-rules.md / english-rules.md(Step 0 阶段就应读完对应学科文件,跳过是关键失败)
- 每个取材于知识点的页面写 `source: {point_id, textbook_page}`
- notes 写讲稿:提问语、过渡语、学生活动指令、易错追问,不写"此处讲解"这类空话

## Step 4 —— 校验自愈

```bash
python scripts/validate_courseware.py --input <courseware.json>
```

按 `errors[].code` 定向修复:KP_NOT_IN_UNIT=换了素材包没有的知识点;NUMBER_OVER_BOUND=数字超纲,改数;MISSING_NOTES=补讲稿;PRACTICE_ITEM_INCOMPLETE=补答案。**只改内容字段,不动 slide_id/type**。修完重跑,直至 `"status": "pass"`。

## Step 5 —— 渲染交付

```bash
bash scripts/render_all.sh <courseware.json> <输出目录>
```

交付话术模板:
> 课件已生成:`<路径>`(共 N 页,其中含练习参考答案页)。
> 依据:人教版X年级上册第X单元《…》第X课时(知识点 A/B/C,教材 P__)。
> 教师讲稿在各页备注栏;练习答案在每页练习后的"参考答案"页。
> (partial 时)本单元知识库为部分核验状态,请课前对照教材核对内容。

## Step 6 —— 迭代

改 JSON → 重校验 → 重渲染,一气呵成,同轮交付。常见迭代:换例题情境、增删练习题、调页顺序(直接移动 slides 数组元素)、加"第2课时"新 deck。
