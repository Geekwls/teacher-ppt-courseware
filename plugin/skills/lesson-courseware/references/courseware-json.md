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
| `practice` | 课堂练习 | items(1~6题,每题 stem+answer) | **必填**。若 `interaction_mode:"instant"` 为单题即时互动页(左题右答、单击揭晓答案、不追加冗余页)；默认多题模式下渲染器自动追加参考答案页 |
| `summary` | 课堂小结 | items(2~4条) | **必填** |
| `board` | 板书设计 | content(多行文本,\n 换行) | 可选 |
| `homework` | 作业布置 | items(2~4条) | **必填** |
| `end` | 结束页 | — | 可选。`message` 默认"下课啦,同学们再见!" |

每页通用可选字段:
- `slide_id`:建议 s01、s02…顺序编号(重复会被拦截)
- `source`: {"point_id": "...", "textbook_page": 40} —— 溯源,凡内容取自某知识点必填 point_id
- `figure`: 声明式图元(见下)
- `notes`: 教师讲稿,渲染进 PPT 备注栏;objectives/warmup/concept/example/misconception/practice/summary/homework **必填**,写"课堂上实际要说的话与提问"
- `reveal_mode`: `"auto"`(默认,省略即可) / `"off"`(该页不做分步,整页一次呈现)
- `reveal_steps`: 整数 1~8,把该页自动推断出的步骤**均匀合并**成指定步数,用于控制课堂节奏

## 课堂放映「播放步骤」

课件默认就是**可逐步播放**的:除封面/结束页外,渲染器自动把每页内容按几何位置聚类成若干步骤,
放映时教师每单击一次淡入出现一步,实现「先出示题目/推导 → 再点击揭晓结论或答案」。
同一条目卡片的底板、编号、正文属于同一步,会一次点击同时出现。

- **无需在 JSON 里写任何字段**,现有课件直接重渲染即生效;
- 步骤顺序自上而下,自动跟随版面,不依赖页面是否写了 `source`;
- 音视频媒体不参与分步(避免点击命中动效层导致视频放不出来);
- 实现链路:`lib_js/reveal_steps.js` 打 `objectName=REVEAL_<step>_<idx>` 标记 →
  `lib_js/deck_transition.js` 解包注入 OpenXML `<p:timing>` 单击进入动效 →
  回执写入 `<标题>.audit.json` 的 `reveal` 字段;
- `--strict` 下若检测到 `p:transition` / `p:timing` 顺序不合规(会导致 PowerPoint 判文件需修复),直接拒绝交付。

示例(只在该页想放慢节奏时才写):

```json
{"type": "example", "problem": "…", "solution_steps": ["…"], "answer": "…",
 "reveal_steps": 3, "notes": "…"}
```

`{"reveal_mode": "off"}` 适合封面式整页情境图、需要一次性展示的图表页。

practice 条目:`{"stem": "...", "options": ["A.1","B.2"], "answer": "B", "source": {...}}`
- `answer` 必填(渲染到答案页,卷面页不显示);开放题写"略(见教参)"
- `options` 仅选择/判断题用,2~6 项
- 同一 practice 页题量 3~6;需要"题+答分屏"就拆成两页

## 声明式图元 figure(渲染为原生 PPT 形状,不依赖图片)

| kind | 参数 | 用途 |
|---|---|---|
| `vertical_calc` | operand_a, operand_b, operator(+ - × ÷), result?, show_result?, carries? | 数学竖式(数位对齐、支持进位/退位小数字标注) |
| `number_line` | start, end, step, marks?, label?, arcs?[{from, to, label?}] | 数轴(支持跳跃推演拱形弧线与步长标注) |
| `tianzige` | chars(≤6字), pinyin?(与 chars 等长) | 语文田字格生字 |
| `pinyin_line` | pairs:[{pinyin, char}](≤12对) | 拼音上行汉字下行 |
| `word_card` | cards:[{word, phonetic?, meaning?}](≤8张) | 英语词卡 |
| `dialog_bubble` | lines:[{speaker, text}](≤8句) | 英语情景对话 |
| `place_value` | digits:{thousands?,hundreds?,tens?,ones}, label? | 数位表(数学数形结合) |
| `table` | headers[], rows[][](≤8行,列数一致) | 价目表/统计表 |
| `media` | title?, type?(video/audio), path?, duration?, link?, prompt?, cover? | 趣味微课/操作视频/课文朗读音频(本地 mp4 原生嵌入; `cover` 可指定封面图, 默认用主题浅色) |
| `animation` | animation_type(number_line_jump/vertical_calc_flow), parameters, title?, prompt?, conclusion?, duration_sec?, path? | 算理动画: 渲染时现场合成 (SVG 逐帧+FFmpeg, 纯确定性) 并原生嵌入 PPT, 可在播放器内直接播放; 相同参数自动缓存复用; `path` 指向已有 mp4 时直接嵌入不再合成; FFmpeg 缺失或参数未过数学门禁时降级为静态演示要点卡并在审计回执留痕, `--strict` 下数学门禁失败一票否决 |

例:
```json
{"kind": "vertical_calc", "operand_a": 28, "operand_b": 3, "operator": "×", "result": 84, "show_result": true, "carries": {"1": 2}}
{"kind": "number_line", "start": 0, "end": 60, "step": 10, "marks": [0, 20, 40, 60], "arcs": [{"from": 0, "to": 20, "label": "+20"}, {"from": 20, "to": 40, "label": "+20"}]}
{"kind": "tianzige", "chars": ["金", "色"], "pinyin": ["jīn", "sè"]}
{"kind": "dialog_bubble", "lines": [{"speaker": "A", "text": "What's your father's job?"}, {"speaker": "B", "text": "He's a doctor."}]}
{"kind": "media", "type": "video", "title": "【操作微课】折纸认识分数", "duration": "01:30", "link": "https://example.com/video", "prompt": "观察折纸对折的方法与重合特点"}
```

## 硬性门禁(校验器一票否决)

1. **知识点白名单**:所有 point_id 只能取自 `query_curriculum.js` 返回的本单元素材
2. **数域上界**(数学):**全部卷面字段**(图元/算理步骤/例题/易错/板书/结论/练习)中的数均不得超过 `unit.numeric_upper_bound`;讲稿中的疑似超纲数降为 warning(避免页码、步骤编号误报)
3. **教学边界红线**:`teaching_boundary.scope_excluded` 对卷面文本生效;页面未写 `source` 时按全单元红线兜底
4. **页码范围**:source.textbook_page 必须落在单元 page_range 内
5. **讲稿完备**:内容页 notes 非空且不少于 20 字(warning);整页内容重复会告警
6. **结构合法**:页面字段按本契约白名单(`slides.items` schema),自创字段会被拒;实质内容页 ≥4
7. **知识库可达**:知识库定位失败时 **fail-closed 判 fail**,不再静默跳过 Tier2/3
8. **渲染几何体检**:渲染后输出 `<标题>.audit.json`,检测画布越界、文字裁切、文本压盖、参考答案缺题;`--strict` 下 critical 直接拒绝交付
9. **动效顺序合规**:`p:transition` 必须排在 `p:timing` 之前;`--strict` 下顺序错误直接拒绝交付

## 修改与迭代

改任何内容:**先改 courseware.json → 跑 validate → 再 render**。不要直接改 pptx(下次重新生成会覆盖)。
