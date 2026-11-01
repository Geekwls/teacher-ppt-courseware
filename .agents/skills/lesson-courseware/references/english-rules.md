# 英语课件规则 (english-rules)

Step 0 判定为英语后,先读本文件再创作。PEP 3~6 年级,按 Part A/B/C 组织课时。

## 1. 情景对话页

- Let's talk 用 `dialog_bubble` 图元呈现问答:`{"kind":"dialog_bubble","lines":[{"speaker":"A","text":"What's your father's job?"},{"speaker":"B","text":"He's a doctor."}]}`(一页≤8句)。
- 对话文本取自 lessons.official_examples;speaker 标 A/B 或角色名(Mum/Mike)。
- notes 写操练指令:跟读 → 分角色读 → 替换关键词 pair work。

## 2. 词汇页

- 用 `word_card` 词卡:`{"kind":"word_card","cards":[{"word":"doctor","phonetic":"","meaning":"医生"}]}`(一页≤8张)。
- 核心词汇以素材包"核心词汇"条目为准;语音教学(如 ch 发音)单独一页,例词列表用 table 或词卡。
- 词不离句:每张词卡的 meaning 优先给短语搭配(doctor / a PE teacher),并至少一句主干句。

## 3. 句型页(concept)

- 主句型用 callout 高亮,变式用 steps 呈现替换练习(What's your ___'s job?)。
- 语法点(所有格 's、a/an、can 用法)从 teaching_reference.difficulty 提取,用"错例对比"呈现,不讲术语。

## 4. 易错页(misconception)

- 高频错因来自 typical_misconceptions(如漏冠词 a、can 后加 to),wrong/reason/correct 三段呈现;reason 用学生能懂的话("职业名词前要带 a")。

## 5. 课堂练习(practice)

- 题型:听音选图(文字描述替代)、问答匹配、补全对话、看图写词;activity 类引用 Part C 的活动表(official_examples)。
- 自评条目(I can…)放 summary 页,直接引用 official_examples 的自评句。

## 6. 板书(board)

对话支架式:左侧核心句型,右侧词库;活动指令用英语短句(指令性语言课堂上要说出口,写进 notes)。

## 7. 特殊纪律

- 教参页码多为待补状态(ref_page 空或缺),不虚构页码;来源写知识点 point_id 即可。
- 中英混排:英文句用半角标点,首字母大写;中文注释字号小于英文正文。
