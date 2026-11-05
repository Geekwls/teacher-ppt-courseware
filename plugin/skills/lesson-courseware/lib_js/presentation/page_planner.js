// -*- coding: utf-8 -*-
/**
 * 课件页面智能规划器 (page_planner.js)
 *
 * 核心职责:
 * 1. 课型骨架: 由 lesson_type 决定必备环节 (见 strategies/lesson_skeleton.js),
 *    缺失的必备环节补"待补充"占位页并在报告中明示, 而不是悄悄产出一节结构残缺的课;
 * 2. 协调教学环节与页面容量: 依据 StrategyResolver 提供的认知负荷评估，决定每个环节的页面数量;
 * 3. 算理超限自动拆页 (防止删减算理):
 *    当探究算理步骤过多时，自动拆分为「探究一·数形建模」与「探究二·算理升华」，杜绝文字溢出;
 * 4. 练习与答案协同拆页:
 *    当练习题量达到 2 题以上时，拆分为「课堂自主作答页」与「逐题诊断参考答案页」;
 * 5. 课型收尾页: 练习课/复习课追加分层作业页, 复习课另有板书结构页;
 * 6. 产出标准 SlidePlan 数组，供 PresentationPlanner 装配。
 */

import { resolveStrategyContext } from "../strategies/strategy_resolver.js";
import { diagnoseSkeleton, missingPhaseStubs } from "../strategies/lesson_skeleton.js";
import { resolveScenePreset } from "../strategies/scene_presets.js";
import { resolveLayoutVariant } from "../rendering/layout_variants.js";
import { formatTeacherGuidance } from "../lesson/guidance_formatter.js";

const GRADE_NAMES = {
  1: "一年级", 2: "二年级", 3: "三年级", 4: "四年级", 5: "五年级", 6: "六年级",
  7: "七年级", 8: "八年级", 9: "九年级"
};
const SUBJECT_NAMES = {
  chinese: "语文",
  math: "数学",
  english: "英语",
  science: "科学"
};

/** 占位页与作业页的文案都要控制长度, 超过卡槽容量会被折行挤压 */
function clip(text, max) {
  const s = String(text || "").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * 课型收尾页: 板书结构 (复习课/公开课兜底)。
 * 提炼结构化短语，杜绝长句截断出现省略号。
 */
function buildBoardDesignSlide(meta, slidePlans, objectives, nextSlideId) {
  const existingBoard = slidePlans.find(s => s.layout === "board_design");
  if (existingBoard) return null;

  const subject = meta.subject || "chinese";
  const topic = meta.topic || "本课核心";

  let branches = [];
  if (subject === "chinese") {
    branches = [
      {
        head: "课文主线",
        items: ["上学：各族相聚 欢声笑语", "上课：安静听读 动物驻足", "下课：摔跤跳舞 边疆欢乐"]
      },
      {
        head: "语文要素",
        items: ["关注新鲜词句", "品读生动拟人", "体会童真童趣"]
      },
      {
        head: "字词书写",
        items: ["左窄右宽 左右避让", "字形匀称 重心平稳"]
      }
    ];
  } else if (subject === "math") {
    branches = [
      {
        head: "算理直观",
        items: ["观察数形直观", "明确计数单位", "数轴规律对应"]
      },
      {
        head: "核心算法",
        items: ["转化思考口算", "算式计算规范", "总结提升法则"]
      }
    ];
  } else {
    branches = [
      {
        head: "核心知识",
        items: ["核心概念感知", "规律方法归纳"]
      },
      {
        head: "综合应用",
        items: ["迁移应用拓展", "思维素养提升"]
      }
    ];
  }

  return {
    slide_id: nextSlideId("board"),
    phase_ref: "meta_board_design",
    layout: "board_design",
    title: "板书设计",
    board_topic: topic,
    board_branches: branches,
    notes: `这是本节课的板书设计。请同学们对照黑板板书，在课堂笔记本上清晰梳理本课脉络与重点。`
  };
}

/**
 * 课型收尾页: 分层作业 (练习课/复习课/公开课兜底)。
 * 给出具体可检查、可操作的任务，杜绝复制抽象目标。
 */
function buildHomeworkSlide(meta, slidePlans, objectives, nextSlideId) {
  const existingHomework = (slidePlans || []).find(s => s.layout === "homework_card");
  if (existingHomework) return null;

  const subject = meta.subject || "chinese";
  let tiers = [];

  if (subject === "chinese") {
    tiers = [
      {
        tier: "必做",
        desc: "【基础巩固】在田字格本上工整书写本课生字与核心词语，朗读课文重点段落。"
      },
      {
        tier: "选做",
        desc: "【能力提升】有感情地朗读课文，在摘抄本上摘抄 2~3 处有新鲜感的优美词句。"
      },
      {
        tier: "挑战",
        desc: "【思维拓展】观察生活中的一处熟悉场景，尝试运用拟人手法写 1~2 句生动的话。"
      }
    ];
  } else {
    tiers = [
      {
        tier: "必做",
        desc: "【基础练习】完成教材配套练习题，熟练掌握基本算理与计算方法。"
      },
      {
        tier: "选做",
        desc: "【变式拓展】尝试完成教材中的思维思考题，检验知识迁移应用能力。"
      },
      {
        tier: "挑战",
        desc: "【生活应用】在生活中找一个能够运用本课数学知识解决的实际问题，记录思路。"
      }
    ];
  }

  return {
    slide_id: nextSlideId("homework"),
    phase_ref: "meta_homework",
    layout: "homework_card",
    title: "分层作业布置",
    homework_tiers: tiers,
    notes: "今天的分层作业：基础必做题全员完成；选做题供学有余力的同学提升；挑战题鼓励联系生活自主探究。"
  };
}

function buildSkeletonQueue(sequence, stubs) {
  const queue = sequence.map(phase => ({ kind: "phase", phase }));

  for (const stub of stubs) {
    const item = { kind: "placeholder", stub };
    if (stub.insertAfterPhaseId) {
      const idx = queue.findIndex(q => q.phase?.phase_id === stub.insertAfterPhaseId);
      queue.splice(idx < 0 ? queue.length : idx + 1, 0, item);
    } else if (stub.insertBeforePhaseId) {
      const idx = queue.findIndex(q => q.phase?.phase_id === stub.insertBeforePhaseId);
      queue.splice(idx < 0 ? 0 : idx, 0, item);
    } else {
      queue.push(item);
    }
  }
  return queue;
}

export function planSlidesFromLesson(lessonPlan, userPreferences = {}) {
  if (!lessonPlan || typeof lessonPlan !== "object") {
    throw new Error("无效的 LessonPlan 对象");
  }

  const meta = lessonPlan.meta || {};
  const objectives = lessonPlan.objectives || [];
  const sequence = lessonPlan.teaching_sequence || [];

  const presetKey = userPreferences.preset || meta.preset || "standard";
  const scenePreset = resolveScenePreset(presetKey, {
    style: userPreferences.style || meta.style,
    layout_variants: { ...(meta.layout_variants || {}), ...(userPreferences.layout_variants || {}) }
  });

  const strategyContext = resolveStrategyContext({
    subject: meta.subject,
    grade: meta.grade,
    lesson_type: meta.lesson_type,
    userPreferences: {
      ...userPreferences,
      style: scenePreset.style
    }
  });

  // 课型骨架: 默认开启补齐 (缺失必备环节才补页, 环节齐备时零副作用);
  // 片段式设计 (缺口比已覆盖槽位还多) 只诊断不补页, 避免把"只要这一段"的课件塞满占位页
  const skeletonReport = diagnoseSkeleton(lessonPlan);
  const fillMissing = userPreferences.skeleton_fill !== false && !skeletonReport.fragmented;
  const stubs = fillMissing ? missingPhaseStubs(skeletonReport) : [];
  const queue = buildSkeletonQueue(sequence, stubs);

  const slidePlans = [];
  let pageCounter = 1;

  function nextSlideId(prefix) {
    return `slide_${String(pageCounter++).padStart(2, "0")}_${prefix}`;
  }

  // 1. 封面 (中文规范学段、学科与课时)
  const gradeText = GRADE_NAMES[meta.grade] || `${meta.grade}年级`;
  const termText = meta.term === "term-2" ? "下册" : "上册";
  const subjectText = SUBJECT_NAMES[meta.subject] || meta.subject || "";
  const unitText = meta.unit ? `第${meta.unit}单元` : "";
  const lessonNumberText = meta.lesson_number ? `第${meta.lesson_number}课` : "课时 1";
  const subtitle = [`${gradeText}${termText}`, subjectText, unitText, lessonNumberText].filter(Boolean).join(" · ");

  slidePlans.push({
    slide_id: nextSlideId("cover"),
    phase_ref: "meta_cover",
    layout: "title_cover",
    title: meta.topic || "课时教学",
    subtitle,
    notes: `同学们好！今天我们一起学习《${meta.topic}》。请同学们准备好课本和练习本，先看大屏幕上的学习目标，明确这节课要完成的三件事，然后跟着老师一步步往下走。`
  });

  // 2. 学习目标 (变体仲裁: list / grid / split_lr)
  const objVariant = resolveLayoutVariant("objectives_card", {
    explicitVariant: meta.layout_variants?.objectives_card || userPreferences.layout_variant,
    presetVariants: scenePreset.variants,
    itemCount: objectives.length
  });

  slidePlans.push({
    slide_id: nextSlideId("objectives"),
    phase_ref: "meta_objectives",
    layout: "objectives_card",
    layout_variant: objVariant,
    title: "学习目标",
    items: objectives.map((o, idx) => `${idx + 1}. ${o.statement}`),
    notes: `本节课的核心学习目标：${objectives.map(o => String(o.statement || "").replace(/[。；;，,\s]+$/, "")).join("；")}。请大家明确学习方向。`
  });

  // 3. 动态规划教学环节 (已按课型骨架补齐缺失的必备环节)
  queue.forEach(item => {
    // 场景 0: 骨架必备环节缺失 —— 落"待补充"占位页并明示, 不静默跳过
    if (item.kind === "placeholder") {
      const { stub } = item;
      slidePlans.push({
        slide_id: nextSlideId("placeholder"),
        phase_ref: `phase_missing_${stub.role}`,
        layout: "phase_placeholder",
        title: `${stub.label}（待补充）`,
        placeholder_role: stub.role,
        placeholder_label: stub.label,
        items: [
          `本节课的「${stub.label}」环节在教学设计中没有提供内容。`,
          stub.hint ? `建议：${stub.hint}。` : "建议：补充该环节的教学内容后再重新生成。",
          "补全这个环节后重新生成课件，本页会自动替换为正式内容。"
        ],
        notes: `本页是待补充环节的提示页。${stub.label}是本课型的必备环节，建议补充后再授课。${stub.hint || ""}`
      });
      return;
    }

    const phase = item.phase;
    const cb = phase.content_block || {};
    const guidance = formatTeacherGuidance(phase.teacher_guidance, {
      speech_detail: scenePreset.speech_detail,
      defaultNote: "请同学们认真观察大屏幕，跟随老师的思路积极思考。"
    });
    const decision = strategyContext.evaluateCapacityAndSplit(cb);
    // 练习页讲稿: 环节过渡属于"核对答案之后"的话, 不能提前放到作答页
    const practiceNotes = guidance.replace(/\n\n【环节过渡】[\s\S]*$/, "");
    const transitionNote = (guidance.match(/【环节过渡】[\s\S]*$/) || [""])[0];

    // 场景 A: 探究步骤膨胀，触发跨页拆分
    if (decision.needSplit && decision.splitMode === "model_and_reasoning_sequence") {
      const nlProps = cb.model_payload || cb.visual_model || { start: 0, end: 60, step: 20, arcs: [] };

      // 拆分子页 1: 直观建模
      slidePlans.push({
        slide_id: nextSlideId("exploration_model"),
        phase_ref: phase.phase_id,
        layout: "model_left_reasoning_right",
        title: `${phase.phase_name} (一) · 数形建模`,
        figure_number_line: nlProps,
        reasoning_items: [
          "① 观察数轴从 0 开始跳跃",
          "② 每次增加一个相同的计数单位",
          "③ 记录跳跃终点位置"
        ],
        conclusion_text: "★ 发现：相同加数相加，在数轴上表现为相同步长的连续跳跃。",
        notes: `${guidance}（第1部分：重点引导学生观察数轴的跳跃规律）`
      });

      // 拆分子页 2: 算理升华与算法总结 (变体跟随 points/tree/mindmap)
      const subSumVariant = resolveLayoutVariant("summary_card", {
        presetVariants: scenePreset.variants,
        itemCount: 3
      });
      slidePlans.push({
        slide_id: nextSlideId("exploration_reasoning"),
        phase_ref: phase.phase_id,
        layout: "summary_card",
        layout_variant: subSumVariant,
        title: `${phase.phase_name} (二) · 算理升华`,
        items: cb.reasoning_steps || [
          "想：20 是 2 个十",
          "2 个十 × 3 = 6 个十",
          "6 个十就是 60"
        ],
        conclusion_text: cb.core_rule || cb.conclusion || "",
        notes: `${guidance}（第2部分：重点从数轴直观升华到计数单位运算法则）`
      });
      return;
    }

    // 场景 B: 练习题量较多，触发题目页与答案页拆分
    if (decision.needSplit && decision.splitMode === "practice_and_answer_dual_page") {
      const items = cb.items || [];
      const prVariant = resolveLayoutVariant("practice_list", {
        explicitVariant: meta.layout_variants?.practice_list || cb.layout_variant,
        presetVariants: scenePreset.variants,
        itemCount: items.length
      });
      // 题目页 (全常驻)
      slidePlans.push({
        slide_id: nextSlideId("practice"),
        phase_ref: phase.phase_id,
        layout: "practice_list",
        layout_variant: prVariant,
        title: phase.phase_name,
        questions: items.map((it, idx) => {
          const numSymbol = ["❶", "❷", "❸", "❹", "❺"][idx] || `(${idx + 1})`;
          let qStr = `${numSymbol} ${it.stem || ""}`;
          if (Array.isArray(it.options) && it.options.length > 0) {
            qStr += "\n" + it.options.join("\n");
          }
          return qStr;
        }),
        notes: practiceNotes
      });

      // 答案诊断页 (逐题揭晓)
      slidePlans.push({
        slide_id: nextSlideId("answer"),
        phase_ref: phase.phase_id,
        layout: "answer_reveal_list",
        title: `${phase.phase_name} · 参考答案与诊断`,
        answer_items: items.map((it, idx) => {
          const numSymbol = ["❶", "❷", "❸", "❹", "❺"][idx] || `(${idx + 1})`;
          const rawAns = String(it.answer || "").trim();
          let rawExp = String(it.explanation || "").trim();
          // 清洗 explanation 中重复的 "★ 参考答案：" 或 "参考答案："
          rawExp = rawExp.replace(/^[★\s]*(?:参考答案|答案)[:：]\s*/g, "").trim();
          // 修正笔误
          rawExp = rawExp.replace(/赋子/g, "赋予");

          let explanationText = "";
          if (rawExp && rawExp !== rawAns) {
            explanationText = `★ 参考答案：${rawAns}   【解析】${rawExp}`;
          } else {
            explanationText = `★ 参考答案：${rawAns}`;
          }

          // 答案页只保留题型标签, 避免整段题干重复占版面
          const stemRaw = String(it.stem || "").trim();
          const stemTag = (stemRaw.match(/^【[^】]+】/) || [""])[0];

          return {
            id: `ans_item_${idx + 1}`,
            question_num: numSymbol,
            stem: stemTag || (stemRaw ? `${stemRaw.slice(0, 14)}…` : ""),
            explanation: explanationText
          };
        }),
        notes: `逐题点击揭晓参考答案：先请学生说出思路，再显示答案，对照订正并说明理由。${transitionNote ? `\n\n${transitionNote}` : ""}`
      });
      return;
    }

    // 场景 C: 长文本品读与多设问，触发原文品读与设问深究拆页 (保障大字号与深度思维)
    if (decision.needSplit && decision.splitMode === "text_reading_and_questions_dual_page") {
      const excerpt = cb.paragraph_excerpt || "";
      const qs = cb.focus_questions || [];

      // 拆分子页 1: 原文沉浸品读 (大字号、充足行距)
      slidePlans.push({
        slide_id: nextSlideId("reading_text"),
        phase_ref: phase.phase_id,
        layout: "reading_focus",
        title: `${phase.phase_name} · 原文品读`,
        context_title: "【原文精读】",
        context_body: excerpt,
        reading_guide: cb.reading_guide || null,
        questions: [],
        // 原文页不再挂 key_phrase: 拆页后下一页已承载"以动衬静"的结论,
        // 两页重复同一句横幅会让学生误以为还没讲完。原文页改为朗读符号说明。
        conclusion_text: cb.reading_guide
          ? "朗读提示：“／”处稍作停顿，红色加粗的词读得重一些、慢一些。"
          : (cb.key_phrase || ""),
        notes: `${guidance}（第1部分：指导学生有感情地朗读原文，沉浸感受语言文字的意境美与节奏感）`
      });

      // 拆分子页 2: 文本设问与深层探究 (设问卡片 + 核心写作手法/主旨横幅)
      slidePlans.push({
        slide_id: nextSlideId("reading_questions"),
        phase_ref: phase.phase_id,
        layout: "reading_focus",
        title: `${phase.phase_name} · 研读思考与探究`,
        context_title: "【研读思考】",
        context_body: "结合上页原文重点语句，深入探究下列核心问题并交流分享：",
        questions: qs,
        conclusion_text: cb.core_rule || cb.key_phrase || "★ 写作启示：观察景物要调动多重感官，融情入景。",
        notes: `${guidance}（第2部分：结合设问引导学生深入探究修辞特色、感官协同与内在行文逻辑）`
      });
      return;
    }

    // 场景 D: 标准单页容纳
    switch (cb.type) {
      case "contextual_problem":
        slidePlans.push({
          slide_id: nextSlideId("warmup"),
          phase_ref: phase.phase_id,
          layout: "context_problem",
          title: phase.phase_name,
          context_title: "【情境呈现】",
          context_body: `${cb.scenario || ""} ${cb.question || ""}`,
          equation: cb.equation || cb.core_expression || "",
          notes: guidance
        });
        break;

      case "vocabulary_focus": {
        const recognizeChars = Array.isArray(cb.recognize_chars) ? cb.recognize_chars.filter(Boolean) : [];
        const wordLines = (cb.words || []).map(w => `${w.word} (${w.pinyin}) ── ${w.focus}`);
        // 识字表单独成行, 让"认识N个生字"的目标在页面上有落点
        if (recognizeChars.length) {
          wordLines.push(`会认字（${recognizeChars.length}个）：${recognizeChars.join(" ")}`);
        }
        slidePlans.push({
          slide_id: nextSlideId("vocab"),
          phase_ref: phase.phase_id,
          layout: "reading_focus",
          title: phase.phase_name,
          context_title: "【重点字词与易错字形】",
          context_body: wordLines.join("\n"),
          conclusion_text: cb.core_rule || "",
          notes: guidance
        });
        break;
      }

      case "character_writing":
        slidePlans.push({
          slide_id: nextSlideId("writing"),
          phase_ref: phase.phase_id,
          layout: "character_practice",
          title: phase.phase_name,
          figure_tianzige: cb.figure || { kind: "tianzige", chars: [], pinyin: [] },
          rules: cb.writing_rules || [],
          guidance_tip: cb.guidance_tip || "认真描红，工整书写。",
          notes: guidance
        });
        break;

      case "text_reading":
        slidePlans.push({
          slide_id: nextSlideId("reading"),
          phase_ref: phase.phase_id,
          layout: "reading_focus",
          title: phase.phase_name,
          context_title: "【课文精读】",
          context_body: cb.paragraph_excerpt || "",
          reading_guide: cb.reading_guide || null,
          questions: cb.focus_questions || [],
          conclusion_text: cb.key_phrase || "",
          notes: guidance
        });
        break;

      case "mathematical_reasoning": {
        const model = cb.model_payload || cb.visual_model;
        // 声明式算理动画 (kind: "animation") 走动态媒体子引擎:
        // 渲染前由 animation_prep 现场合成视频(数学门禁前置), 表现层零坐标感知。
        if (model && model.kind === "animation") {
          slidePlans.push({
            slide_id: nextSlideId("exploration"),
            phase_ref: phase.phase_id,
            layout: "model_left_reasoning_right",
            title: phase.phase_name,
            figure_animation: model,
            reasoning_items: cb.reasoning_steps || [],
            conclusion_text: `★ 核心规律：${cb.core_rule || cb.conclusion || ""}`,
            notes: guidance
          });
        } else {
          slidePlans.push({
            slide_id: nextSlideId("exploration"),
            phase_ref: phase.phase_id,
            layout: "model_left_reasoning_right",
            title: phase.phase_name,
            figure_number_line: model,
            reasoning_items: cb.reasoning_steps || [],
            conclusion_text: `★ 核心规律：${cb.core_rule || cb.conclusion || ""}`,
            notes: guidance
          });
        }
        break;
      }

      case "worked_example":
        slidePlans.push({
          slide_id: nextSlideId("example"),
          phase_ref: phase.phase_id,
          layout: "example_step_by_step",
          title: phase.phase_name,
          problem_title: "【教材例题】",
          problem_body: cb.problem || "",
          steps: cb.solution_steps || [],
          answer: cb.answer || "",
          notes: guidance
        });
        break;

      case "misconception_analysis":
        slidePlans.push({
          slide_id: nextSlideId("misconception"),
          phase_ref: phase.phase_id,
          layout: "misconception_split",
          title: phase.phase_name,
          wrong_case: cb.wrong_case || "",
          cause_analysis: cb.cause_analysis || "",
          correct_method: cb.correct_method || "",
          notes: guidance
        });
        break;

      case "rule_summary": {
        const sumVariant = resolveLayoutVariant("summary_card", {
          explicitVariant: meta.layout_variants?.summary_card || cb.layout_variant,
          presetVariants: scenePreset.variants,
          itemCount: (cb.summary_points || []).length
        });
        slidePlans.push({
          slide_id: nextSlideId("summary"),
          phase_ref: phase.phase_id,
          layout: "summary_card",
          layout_variant: sumVariant,
          title: phase.phase_name,
          items: cb.summary_points || [],
          notes: guidance
        });
        break;
      }

      case "activity_instruction": {
        slidePlans.push({
          slide_id: nextSlideId("activity"),
          phase_ref: phase.phase_id,
          layout: "activity_instruction",
          title: phase.phase_name,
          activity_type: cb.activity_type || "小组合作",
          duration: cb.duration || "4分钟",
          tasks: cb.tasks || cb.steps || ["组内轮流表达自己的思路", "记录关键发现与不同解法", "推选代表准备全班分享"],
          prompt: cb.prompt || cb.requirements || "表达清晰，倾听专注，相互补充。",
          notes: guidance
        });
        break;
      }

      case "comparison_table": {
        slidePlans.push({
          slide_id: nextSlideId("compare"),
          phase_ref: phase.phase_id,
          layout: "comparison_table",
          title: phase.phase_name,
          headers: cb.headers || ["对比维度", "常见误区 / 对照项", "标准做法 / 核心规律"],
          rows: cb.rows || [
            ["关键特征", cb.left_feature || "易混点", cb.right_feature || "正解点"]
          ],
          summary_tip: cb.summary_tip || cb.conclusion || "对比辨析，抓住本质特征",
          notes: guidance
        });
        break;
      }

      case "knowledge_tree": {
        slidePlans.push({
          slide_id: nextSlideId("tree"),
          phase_ref: phase.phase_id,
          layout: "knowledge_tree",
          title: phase.phase_name,
          root_topic: cb.root_topic || meta.topic || "本单元核心知识",
          branches: cb.branches || (cb.nodes || []).map(n => ({
            name: n.name || n.title,
            leaves: n.leaves || n.items || []
          })),
          notes: guidance
        });
        break;
      }

      case "board_design": {
        slidePlans.push({
          slide_id: nextSlideId("board"),
          phase_ref: phase.phase_id,
          layout: "board_design",
          title: phase.phase_name || "板书设计",
          board_topic: cb.center_topic || cb.title || meta.topic || "本课知识",
          board_branches: cb.columns || cb.branches || [],
          notes: guidance
        });
        break;
      }

      case "layered_homework": {
        const tiers = [];
        if (cb.required) tiers.push({ tier: "必做", desc: cb.required });
        if (cb.optional) tiers.push({ tier: "选做", desc: cb.optional });
        if (cb.challenge) tiers.push({ tier: "挑战", desc: cb.challenge });
        if (!tiers.length && Array.isArray(cb.tiers)) {
          tiers.push(...cb.tiers);
        }
        slidePlans.push({
          slide_id: nextSlideId("homework"),
          phase_ref: phase.phase_id,
          layout: "homework_card",
          title: phase.phase_name || "分层课后作业",
          homework_tiers: tiers,
          notes: guidance
        });
        break;
      }

      default:
        break;
    }
  });

  // 4. 课型收尾页 (骨架声明 + 场景预设额外收尾页):
  const closersToRender = new Set([
    ...skeletonReport.closers,
    ...(scenePreset.extra_closers || [])
  ]);

  if (closersToRender.has("board")) {
    const boardSlide = buildBoardDesignSlide(meta, slidePlans, objectives, nextSlideId);
    if (boardSlide) slidePlans.push(boardSlide);
  }
  if (closersToRender.has("homework")) {
    const hwSlide = buildHomeworkSlide(meta, slidePlans, objectives, nextSlideId);
    if (hwSlide) slidePlans.push(hwSlide);
  }

  // 5. 封底 (结束寄语按学科取用, 避免语文课出现数学味的"熟能生巧")
  const endSubtitle = {
    chinese: "多读多写，日积月累",
    math: "认真练习，熟能生巧",
    english: "多听多说，熟能生巧"
  }[meta.subject] || "认真练习，熟能生巧";

  slidePlans.push({
    slide_id: nextSlideId("end"),
    phase_ref: "meta_end",
    layout: "end_cover",
    title: "同学们，下课！",
    subtitle: endSubtitle,
    notes: "今天的课就上到这里。课后请完成分层作业：必做部分人人过关，选做和挑战量力而行；下节课我们先交流摘抄与观察写话。同学们，下课！"
  });

  return {
    strategyContext,
    scenePreset,
    slidePlans,
    skeletonReport: {
      ...skeletonReport,
      filled: stubs.map(s => ({ role: s.role, label: s.label }))
    }
  };
}
