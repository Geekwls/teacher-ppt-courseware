# 知识库与证据引用规范 (knowledge-base)

## 知识库结构

`plugin/knowledge/` 内置五层事实源(vendored 自 primary-school-practice-skill 项目,人教版):

```
curriculum/primary-{math,chinese,english}/grade-N-term-{1,2}/unit-XX/
  metadata.yaml           单元事实:名称/页码范围/数域上界/核验状态/单元概览
  lessons.yaml            课时(课文)层:lesson_name/页码/教材例题原文/核心算理
  knowledge_points.yaml   知识点层:教学目标/先修后续/题型适用/教学边界/溯源/核验状态
  teaching_reference.yaml 教参层:重难点/典型错因/变式策略(依据教师教学用书)
  question_blueprints.yaml 命题蓝图:题型/题量/难度配比/考点归属
```

核验语义(如实使用,禁止混淆):
- `verified`:具备教材/教参原始凭证,可放心引用;
- `partial`:结构在但凭证不全(如教参纯扫描件未 OCR),内容可用但**必须**提醒教师课前核对;
- 未建库单元:query 返回 not_found,不存在的覆盖不硬造。

## 查询工具

唯一入口 `scripts/query_curriculum.js`(支持 --prompt 自然语言 / 结构化参数 / --list-units / --search)。返回单一 JSON:
- `status=ok`:直接使用;
- `status=need_clarification`:带 candidates/missing_fields,向教师确认后重查;
- `status=not_found`:知识库未覆盖,如实说明,不得用训练知识冒充教材内容并标 verified。

## 引用纪律(写入 lesson_plan.json 时)

1. `curriculum_evidence.referenced_knowledge_points`:本 deck 实际用到的全部 point_id;
2. 页面级溯源:例题/易错/练习页写 `source.point_id`;能确定教材页码时写 `source.textbook_page`(必须是素材包出现过的页码,校验器会核对页码范围);
3. `curriculum_status` 与 `evidence_summary` 从素材包如实转写,一处 summary 说清"依据什么版本教材/教参、哪些页";
4. teaching_boundary.scope_excluded 列出的内容(后续学年知识、旧版篇目等)**禁止**出现在任何页面;
5. 数学数字硬约束:`unit.numeric_upper_bound` 之外的数不得出现(校验器 Tier 3 拦截)。

## 修改知识库

知识库是**数据,不是代码**:发现内容错误时,修正对应 YAML 并在 provenance.version_note 记录;不要为迁就某次课件生成而改动事实源。知识库更新走原项目发布流程(见 DATA_PIPELINE_STANDARD.md)。
