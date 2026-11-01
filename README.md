# 教师 PPT 课件生成插件 (teacher-ppt-courseware)

> **一句话定位**:老师对 AI 助手说一句"帮我做三年级上册数学第四单元第1课时的课件",
> 得到一份可直接放映、可继续编辑的 `.pptx`——例题有教材页码、易错点有教参依据、
> 练习带参考答案页、每页备注栏里有讲稿。
>
> **架构借鉴** [anthropics/k12-teacher-skills](https://github.com/anthropics/k12-teacher-skills),
> 内容底座复用同工作区 `primary-school-practice-skill` 的人教版五层教材知识库,详见 [NOTICE.md](NOTICE.md)。

---

## 一、架构:四层物理隔离

```
+---------------------------------------------------------------------+
| 1. 教材知识库 (plugin/knowledge/)                                     |
|    五层事实源:metadata / lessons(教材例题原文) / knowledge_points     |
|    (教学目标·边界) / teaching_reference(教参重难点·典型错因) / 蓝图    |
|    157 单元 / 556 知识点,verified 需原始凭证,绝不假造                 |
+---------------------------------------------------------------------+
                                  │
+---------------------------------------------------------------------+
| 2. 课件 Skill (plugin/skills/lesson-courseware/)                     |
|    SKILL.md 五步工作流:路由→澄清→取材→创作→校验→渲染→迭代            |
|    宿主大模型即教学设计与内容创作引擎,输出 courseware.json 契约        |
+---------------------------------------------------------------------+
                                  │
+---------------------------------------------------------------------+
| 3. 确定性裁判门禁 (scripts/validate_courseware.py)                    |
|    Tier1 结构Schema/讲稿完备 · Tier2 知识点白名单/课时归属             |
|    Tier3 数域上界拦截(数学)/教材页码范围核验 —— 一票否决+定向自愈      |
+---------------------------------------------------------------------+
                                  │
+---------------------------------------------------------------------+
| 4. 确定性渲染引擎 (scripts/render_deck.py + lib/)                     |
|    python-pptx 原生形状:封面/目标/分步新知/例题卡/易错三段/练习         |
|    田字格·拼音行·竖式·数轴·数位表·词卡·对话气泡 · 防近视大字号          |
|    讲稿进备注栏;练习自动升页+自动参考答案页;partial 状态页脚如实提示    |
+---------------------------------------------------------------------+
```

**Non-Goals**:不做海量课件预生成(现场按课时创作);不做未经核验的教材宣称;
不直接产出 pptx 二进制(一律经 JSON 契约+校验+确定性渲染,同输入恒同输出)。

## 二、目录结构

```
teacher-ppt-courseware/
├── AGENTS.md                           # 所有 Agent 的通用入口(项目说明+纪律+命令速查)
├── .claude-plugin/marketplace.json     # 插件市场清单(仿 k12)
├── plugin/
│   ├── .claude-plugin/plugin.json
│   ├── knowledge/                      # 【独立】人教版五层知识库(vendored)
│   └── skills/lesson-courseware/
│       ├── SKILL.md                    # 入口:五步工作流 + 五条纪律
│       ├── references/                 # workflow / courseware-json 契约 / 三科规则 / 知识库规范
│       ├── rendering/pptx.md           # 渲染入口(禁止阅读渲染器源码)
│       ├── scripts/                    # query_curriculum / validate_courseware / render_all / render_deck
│       └── lib/                        # deck_schema 契约校验 / theme / layouts / figures / kb_locate
├── evals/                              # LLM-as-judge 评测协议 + rubric CSV(shared+三科)
├── acceptance/                         # 三科金样 courseware.json + cases.yaml(只读)
├── scripts/                            # run_acceptance.py / install_skill.py
└── tests/                              # pytest(结构校验/查询/渲染/几何边界)
```

## 三、安装与使用

> 所有 Agent 均可使用:仓库根的 **[AGENTS.md](AGENTS.md)** 是通用入口(Codex / Gemini CLI / Cursor /
> Copilot / Zed / Devin 等开机自动读取),指向标准 SKILL.md 与可独立执行的脚本;
> Skill 采用 Agent Skills 开放标准(`SKILL.md` 目录)。

| 使用环境 | 发现机制 | 说明 |
|---|---|---|
| Claude Code / ZCode | 插件市场(`.claude-plugin/`)或 `.claude/skills/` | 自动触发技能 |
| Codex / Antigravity | `.agents/skills/`(共享约定) | 自动发现 |
| 其他 Agent(含网页/托管 agent) | 读 `AGENTS.md` → 按 SKILL.md 工作流调用脚本 | 无需技能发现能力,能读文件跑命令即可 |
| 人(无 Agent) | 直接跑三科金样 + 改 JSON 重渲染 | `scripts/run_acceptance.py` |

### 同步安装(把正本刷到各发现目录)

```bash
python scripts/install_skill.py                  # 项目级:.agents/skills/ + .claude/skills/
python scripts/install_skill.py --user           # 用户级:~/.agents/skills/ + ~/.claude/skills/(所有项目可用)
python scripts/install_skill.py --dirs agents    # 只同步指定目录(agents|claude)
python scripts/install_skill.py --target <dir>   # 安装到其他项目根
python scripts/install_skill.py --check          # 校验全部目标与正本零漂移
```

跨项目/用户级安装时知识库通过 `COURSEWARE_KNOWLEDGE_DIR` 环境变量指向本仓库 `plugin/knowledge/`
(或整仓克隆,kb_locate 会自动向上查找)。

### 方式 A:Claude Code / ZCode(插件市场)

```bash
# 从 GitHub 直接安装
claude plugin marketplace add Geekwls/teacher-ppt-courseware
claude plugin install teacher-ppt-courseware@teacher-ppt-courseware

# 或本地克隆后安装
git clone https://github.com/Geekwls/teacher-ppt-courseware
claude plugin marketplace add ./teacher-ppt-courseware
claude plugin install teacher-ppt-courseware@teacher-ppt-courseware
```

装好后直接对话:"帮我做三年级上册数学第四单元第1课时的课件"。

### 方式 B:Codex / Antigravity(.agents 同步)

```bash
python scripts/install_skill.py --dirs agents   # 同步到 .agents/skills/
python scripts/install_skill.py --check         # 校验零差异同构
```

### 依赖

Python 3.10+;`pip install -r requirements.txt`(python-pptx / PyYAML / jsonschema)。

## 四、老师怎么用(示例指令)

| 学科 | 指令示例 | 产出 |
|---|---|---|
| 数学 | 帮我做三年级上册第四单元第1课时的课件 | 口算乘法:算理分步+竖式图元+易错警示+分层练习 |
| 语文 | 做《铺满金色巴掌的水泥道》的课件 | 田字格生字+拼音行+多音字辨析+词语理解方法 |
| 英语 | 做四年级上册 Unit 1 Part A 的课件 | 对话气泡+职业词卡+句型操练+自评小结 |

修订只需说"把练习第2题换成判断题"——Skill 改 JSON → 重校验 → 重渲染,全部页面同步更新。

## 五、质量门禁速览

| 门禁 | 拦截内容 |
|---|---|
| Tier 1 | Schema 违规、未知页型、缺必填字段、缺讲稿、slide_id 重复、图元参数错误、内容页过少 |
| Tier 2 | 引用素材包外知识点(KP_NOT_IN_UNIT)、lesson_id 不属于本单元 |
| Tier 3 | 数学数字超数域上界(NUMBER_OVER_BOUND)、溯源页码越出单元范围(PAGE_OUT_OF_RANGE) |

核验状态如实呈现:verified 可放心使用;partial 渲染时页脚自动附"使用前请核对"。

## 六、验证与验收

```bash
python -m pytest tests/ -q          # 35 项单元测试
python scripts/run_acceptance.py    # 三科金样端到端:校验→渲染→结构断言→报告
```

三科金样(数学口算乘法 / 语文第5课 / 英语 Part A)全部通过:
校验 pass、页数 15~16、关键内容齐全、讲稿覆盖、零画布越界;报告在 `output/reports/acceptance-report.md`。

> 边界声明:自动化门禁只判定"可结构化"的项目;课件内容的教学正确性须经教师人工审核。
> 本项目与原练习生成项目共用一套诚实原则:**绝不把"生成成功"当作"内容正确"**。

## 七、评测(evals)

LLM-as-judge 协议见 [evals/README.md](evals/README.md):P(教学设计)/R(学科严谨)/O(输出契约)/
M(模型脚手架)四桶逐条 0/1 判分,`rubrics/{shared,math,chinese,english}.csv`,
M 桶对照对话过程、其余对照产出物;partial 场景必须验证"如实告知"行为。
