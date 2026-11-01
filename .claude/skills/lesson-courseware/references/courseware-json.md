# 课件 JSON 契约 (courseware.json)

宿主大模型按本契约创作课件 JSON,确定性渲染器将其渲染为 .pptx。**结构字段(slide_id/type/字段名)严禁自创**;内容字段自由创作但必须可溯源。

## 顶层结构

```json
{
  "deck_id": "cw-math-g3-t1-u04-l01",     // 固定格式: cw-学科-g年级-t册次(1|2)-u单元-l课时;整单元课件用 lall
  "metadata": {
    "title": "多位数乘一位数·口算乘法",     // 封面主标题,≤30字
    "subtitle": "整十、整百、整千数乘一位数", // 可选
    "subject": "math",                     // math | chinese | english
    "grade": 3, "term": "term-1",
    "unit_id": "unit-4", "unit_name": "第四单元 多位数乘一位数",
    "lesson_id": "lesson-01",              // 取自素材包 lessons_index
    "lesson_name": "整十、整百、整千数乘一位数的口算",
    "class_period_label": "第1课时",        // 语文用 "第5课",英语用 "Part A"
    "teacher_name": "", "school": "",      // 留空则封面不显示
    "style": "standard"                    // standard | innovative
  },
  "curriculum_evidence": {
    "referenced_knowledge_points": ["math-g3-t1-u04-p01"],   // 只能引用素材包返回的 point_id
    "lesson_ref": "lesson-01",
    "curriculum_status": "verified",       // 如实取自素材包 unit.verification_status
    "evidence_summary": "依据人教版2024审定版…P40…",
    "page_refs": ["P40"]
  },
  "slides": [ ... ]                        // 一课时 12~18 页;硬限制 6~40
}
```

## 幻灯片类型(11 种)

| type | 用途 | 必填字段 | 备注 notes |
|---|---|---|---|
| `cover` | 封面 | title | 可选。另可选 `subtitle`、`meta_line`(学科年级课时一行) |
| `objectives` | 学习目标 | items(2~4条) | **必填** |
| `warmup` | 复习/情境导入 | items(2~4条) | **必填**。答案写在 notes 里 |
| `concept` | 新知讲解(分步) | steps(3~5步) | **必填**。另可选 `callout`(关键结论高亮框) |
| `example` | 教材例题 | problem, solution_steps(2~5步), answer | **必填** |
| `misconception` | 易错警示 | wrong(错例), reason(错因), correct(正解) | **必填** |
| `practice` | 课堂练习 | items(3~6题,每题 stem+answer) | **必填**。`show_answers:false`(默认)时渲染器自动追加答案页 |
| `summary` | 课堂小结 | items(2~4条) | **必填** |
| `board` | 板书设计 | content(多行文本,\n 换行) | 可选 |
| `homework` | 作业布置 | items(2~4条) | **必填** |
| `end` | 结束页 | — | 可选。`message` 默认"下课啦,同学们再见!" |

每页通用可选字段:
- `slide_id`:建议 s01、s02…顺序编号(重复会被拦截)
- `source`: {"point_id": "...", "textbook_page": 40} —— 溯源,凡内容取自某知识点必填 point_id
- `figure`: 声明式图元(见下)
- `notes`: 教师讲稿,渲染进 PPT 备注栏;objectives/warmup/concept/example/misconception/practice/summary/homework **必填**,写"课堂上实际要说的话与提问"

practice 条目:`{"stem": "...", "options": ["A.1","B.2"], "answer": "B", "source": {...}}`
- `answer` 必填(渲染到答案页,卷面页不显示);开放题写"略(见教参)"
- `options` 仅选择/判断题用,2~6 项
- 同一 practice 页题量 3~6;需要"题+答分屏"就拆成两页

## 声明式图元 figure(渲染为原生 PPT 形状,不依赖图片)

| kind | 参数 | 用途 |
|---|---|---|
| `vertical_calc` | operand_a, operand_b, operator(+ - × ÷), result?, show_result? | 数学竖式(数位对齐) |
| `number_line` | start, end, step, marks?, label? | 数轴 |
| `tianzige` | chars(≤6字), pinyin?(与 chars 等长) | 语文田字格生字 |
| `pinyin_line` | pairs:[{pinyin, char}](≤12对) | 拼音上行汉字下行 |
| `word_card` | cards:[{word, phonetic?, meaning?}](≤8张) | 英语词卡 |
| `dialog_bubble` | lines:[{speaker, text}](≤8句) | 英语情景对话 |
| `place_value` | digits:{thousands?,hundreds?,tens?,ones}, label? | 数位表(数学数形结合) |
| `table` | headers[], rows[][](≤8行,列数一致) | 价目表/统计表 |

例:
```json
{"kind": "vertical_calc", "operand_a": 20, "operand_b": 3, "operator": "×", "result": 60, "show_result": true}
{"kind": "tianzige", "chars": ["金", "色"], "pinyin": ["jīn", "sè"]}
{"kind": "dialog_bubble", "lines": [{"speaker": "A", "text": "What's your father's job?"}, {"speaker": "B", "text": "He's a doctor."}]}
```

## 硬性门禁(校验器一票否决)

1. **知识点白名单**:所有 point_id 只能取自 query_curriculum.py 返回的本单元素材
2. **数域上界**(数学):图元/练习题干与答案中出现的数不得超过 unit.numeric_upper_bound
3. **页码范围**:source.textbook_page 必须落在单元 page_range 内
4. **讲稿完备**:内容页 notes 非空
5. **结构合法**:类型/字段按本契约;实质内容页(目标/导入/新知/例题/练习/小结等)≥4

## 修改与迭代

改任何内容:**先改 courseware.json → 跑 validate → 再 render**。不要直接改 pptx(下次重新生成会覆盖)。
