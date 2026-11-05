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

/** 占位页与作业页的文案都要控制长度, 超过卡槽容量会被折行挤压 */
function clip(text, max) {
  const s = String(text || "").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * 课型收尾页: 板书结构 (复习课)。
 * 内容只从已规划页面里聚合, 不新编教材事实:
 * 主线取小结要点, 易错取易错辨析页的正解。
 */
function buildBoardDesignSlide(meta, slidePlans, objectives, nextSlideId) {
  const lastOf = layout => [...slidePlans].reverse().find(s => s.layout === layout);

  const summarySlide = lastOf("summary_card");
  const miscSlide = lastOf("misconception_split");

  const branches = [];
  const points = (summarySlide?.items || []).filter(Boolean);
  if (points.length) {
    branches.push({ head: "知识主线", items: points.slice(0, 3).map(p => clip(p, 26)) });
  }
  if (miscSlide?.correct_method) {
    branches.push({ head: "易错提醒", items: [clip(miscSlide.correct_method, 42)] });
  }
  if (!branches.length) {
    branches.push({ head: "本课要点", items: [clip(meta.topic || "本课知识", 26)] });
  }

  // 页脚回扣学习目标: 比再复述一遍小结要点更有板书价值, 也避免与"知识主线"重复
  const firstObjective = String(objectives?.[0]?.statement || "").trim();

  return {
    slide_id: nextSlideId("board"),
    phase_ref: "meta_board_design",
    layout: "board_design",
    title: "板书设计",
    board_topic: meta.topic || "本课知识",
    board_branches: branches,
    board_footer: firstObjective ? `目标回扣：${clip(firstObjective, 30)}` : "",
    notes: `这是本节课的板书结构。请同学们对照板书，把${meta.topic || "本课知识"}的知识主线在笔记本上重新梳理一遍，特别注意易错提醒部分。`
  };
}

/**
 * 课型收尾页: 分层作业 (练习课/复习课/实验课)。
 * 只给"练什么"的层级与目标指向, 不编具体题号 —— 题目由教师按本班教材版本填写。
 */
function buildHomeworkSlide(meta, objectives, nextSlideId) {
  const objs = (objectives || []).map(o => String(o.statement || "")).filter(Boolean);
  const tiers = [
    {
      tier: "必做",
      desc: objs[0] ? clip(objs[0], 30) : "完成教材配套基础练习，巩固本课核心方法"
    },
    {
      tier: "选做",
      desc: objs[1] ? clip(objs[1], 30) : "尝试变式题，检验方法能否迁移到新情境"
    },
    {
      tier: "挑战",
      desc: "联系生活找一个本课知识的实际应用，下次课前分享"
    }
  ];

  return {
    slide_id: nextSlideId("homework"),
    phase_ref: "meta_homework",
    layout: "homework_card",
    title: "作业布置",
    homework_tiers: tiers,
    notes: `今天的分层作业：必做题人人完成，对应${objs[0] ? "目标①" : "本课基础"}；选做题给学有余力的同学；挑战题不限形式，鼓励用自己的话讲清楚道理。`
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

  const strategyContext = resolveStrategyContext({
    subject: meta.subject,
    grade: meta.grade,
    lesson_type: meta.lesson_type,
    userPreferences
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

  // 1. 封面
  slidePlans.push({
    slide_id: nextSlideId("cover"),
    phase_ref: "meta_cover",
    layout: "title_cover",
    title: meta.topic || "课时教学",
    subtitle: `${meta.grade}年级${meta.term === "term-1" ? "上册" : "下册"}${meta.subject === "math" ? "数学" : meta.subject}第${meta.unit}单元 · 课时 1`,
    notes: `同学们好！今天我们一起学习${meta.topic}。`
  });

  // 2. 学习目标
  slidePlans.push({
    slide_id: nextSlideId("objectives"),
    phase_ref: "meta_objectives",
    layout: "objectives_card",
    title: "学习目标",
    items: objectives.map((o, idx) => `${idx + 1}. ${o.statement}`),
    notes: `本节课的核心学习目标：${objectives.map(o => o.statement).join("；")}。请大家明确学习方向。`
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
    const rawGuidance = String(phase.teacher_guidance || "").trim();
    const guidance = rawGuidance.length >= 5
      ? rawGuidance
      : "请同学们认真观察大屏幕，跟随老师的思路积极思考。";
    const decision = strategyContext.evaluateCapacityAndSplit(cb);

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

      // 拆分子页 2: 算理升华与算法总结
      slidePlans.push({
        slide_id: nextSlideId("exploration_reasoning"),
        phase_ref: phase.phase_id,
        layout: "summary_card",
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
      // 题目页 (全常驻)
      slidePlans.push({
        slide_id: nextSlideId("practice"),
        phase_ref: phase.phase_id,
        layout: "practice_list",
        title: phase.phase_name,
        questions: items.map((it, idx) => {
          const numSymbol = ["❶", "❷", "❸", "❹", "❺"][idx] || `(${idx + 1})`;
          return `${numSymbol} ${it.stem || ""}`;
        }),
        notes: "请同学们拿出练习本独立完成题目，稍后进入答案核对与思路诊断环节。"
      });

      // 答案诊断页 (逐题揭晓)
      slidePlans.push({
        slide_id: nextSlideId("answer"),
        phase_ref: phase.phase_id,
        layout: "answer_reveal_list",
        title: `${phase.phase_name} · 参考答案与诊断`,
        answer_items: items.map((it, idx) => {
          const numSymbol = ["❶", "❷", "❸", "❹", "❺"][idx] || `(${idx + 1})`;
          return {
            id: `ans_item_${idx + 1}`,
            question_num: numSymbol,
            stem: it.stem || "",
            explanation: `★ 参考答案：${it.answer || ""} (${it.explanation || ""})`
          };
        }),
        notes: guidance
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
        questions: [],
        conclusion_text: cb.key_phrase || "",
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

      case "vocabulary_focus":
        slidePlans.push({
          slide_id: nextSlideId("vocab"),
          phase_ref: phase.phase_id,
          layout: "reading_focus",
          title: phase.phase_name,
          context_title: "【重点字词与多音字】",
          context_body: (cb.words || []).map(w => `${w.word} (${w.pinyin}) ── ${w.focus}`).join("\n"),
          conclusion_text: cb.core_rule || "",
          notes: guidance
        });
        break;

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

      case "rule_summary":
        slidePlans.push({
          slide_id: nextSlideId("summary"),
          phase_ref: phase.phase_id,
          layout: "summary_card",
          title: phase.phase_name,
          items: cb.summary_points || [],
          notes: guidance
        });
        break;

      default:
        break;
    }
  });

  // 4. 课型收尾页 (骨架声明): 复习课先板书结构, 再分层作业
  if (skeletonReport.closers.includes("board")) {
    slidePlans.push(buildBoardDesignSlide(meta, slidePlans, objectives, nextSlideId));
  }
  if (skeletonReport.closers.includes("homework")) {
    slidePlans.push(buildHomeworkSlide(meta, objectives, nextSlideId));
  }

  // 5. 封底
  slidePlans.push({
    slide_id: nextSlideId("end"),
    phase_ref: "meta_end",
    layout: "end_cover",
    title: "同学们，下课！",
    subtitle: "认真练习，熟能生巧",
    notes: "今天的课就上到这里，同学们下课，再见！"
  });

  return {
    strategyContext,
    slidePlans,
    skeletonReport: {
      ...skeletonReport,
      filled: stubs.map(s => ({ role: s.role, label: s.label }))
    }
  };
}
