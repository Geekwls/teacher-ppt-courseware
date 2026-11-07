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
import { GRADE_NAMES } from "../domain/grades.js";
import { subjectLabel } from "../domain/subjects.js";
import { contentPackFor } from "../strategies/content_packs.js";
import { resolveBlockLayout } from "../strategies/block_layout_map.js";
import { resolvePolicyPack } from "../strategies/policy_packs.js";
import { PLAN_BUILDERS } from "./plan_builders.js";

/**
 * 课型收尾页: 板书结构 (复习课/公开课兜底)。
 * 提炼结构化短语，杜绝长句截断出现省略号。
 */
function buildBoardDesignSlide(meta, slidePlans, objectives, nextSlideId) {
  const existingBoard = slidePlans.find(s => s.layout === "board_design");
  if (existingBoard) return null;

  // 兜底文案来自学科内容包 (references/strategies/content-packs.yaml), 不在代码里创作
  const pack = contentPackFor(meta.subject);
  const topic = meta.topic || "本课核心";
  const branches = pack.board_design?.branches || [];

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

  // 兜底文案来自学科内容包 (references/strategies/content-packs.yaml), 不在代码里创作
  const pack = contentPackFor(meta.subject);
  const tiers = pack.homework?.tiers || [];

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

  // 策略偏好合并 (modular-architecture.md 4.4 Level 5):
  // 显式 userPreferences > 课时/单元 policy pack > meta 默认; 空包时与历史行为等价
  const policyPack = resolvePolicyPack(meta, lessonPlan.lesson_id || "");
  const prefs = {
    preset: userPreferences.preset || policyPack.preset || meta.preset || "standard",
    style: userPreferences.style || policyPack.style || meta.style,
    layout_variant: userPreferences.layout_variant || policyPack.layout_variant,
    layout_variants: {
      ...(meta.layout_variants || {}),
      ...(policyPack.layout_variants || {}),
      ...(userPreferences.layout_variants || {})
    },
    skeleton_fill: userPreferences.skeleton_fill ?? policyPack.skeleton_fill
  };

  const presetKey = prefs.preset;
  const scenePreset = resolveScenePreset(presetKey, {
    style: prefs.style,
    layout_variants: prefs.layout_variants
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

  // 学科兜底内容包: 只提供拆页/收尾页的默认文案, 正规内容仍必须来自 LessonPlan
  const contentPack = contentPackFor(meta.subject);

  // 课型骨架: 默认开启补齐 (缺失必备环节才补页, 环节齐备时零副作用);
  // 片段式设计 (缺口比已覆盖槽位还多) 只诊断不补页, 避免把"只要这一段"的课件塞满占位页
  const skeletonReport = diagnoseSkeleton(lessonPlan);
  const fillMissing = prefs.skeleton_fill !== false && !skeletonReport.fragmented;
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
  const subjectText = subjectLabel(meta.subject);
  const unitText = meta.unit ? `第${meta.unit}单元` : "";
  const lessonNumberText = meta.class_period
    ? `第${meta.class_period}课时`
    : (meta.lesson_number ? `第${meta.lesson_number}课` : "课时 1");
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
    explicitVariant: meta.layout_variants?.objectives_card || prefs.layout_variant,
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

    // 版式解析: 显式 content_block.layout > block-layout-map (units > subjects > default)
    const layoutChoice = resolveBlockLayout({ meta, cb });

    // 场景 E: 组合版式单页直装 —— 内容字段由 spec 的 "$plan:" 引用, 不参与拆页场景
    if (layoutChoice.layout === "composite") {
      slidePlans.push({
        slide_id: nextSlideId("composite"),
        phase_ref: phase.phase_id,
        layout: "composite",
        ...cb,
        title: phase.phase_name,
        ...(layoutChoice.spec ? { layout_spec_name: layoutChoice.spec } : {}),
        notes: guidance
      });
      return;
    }

    // 场景 A: 探究步骤膨胀，触发跨页拆分 (教师显式指定版式时不擅自拆页)
    if (!layoutChoice.explicit && decision.needSplit && decision.splitMode === "model_and_reasoning_sequence") {
      const nlProps = cb.model_payload || cb.visual_model || { start: 0, end: 60, step: 20, arcs: [] };

      // 拆分子页 1: 直观建模
      slidePlans.push({
        slide_id: nextSlideId("exploration_model"),
        phase_ref: phase.phase_id,
        layout: "model_left_reasoning_right",
        title: `${phase.phase_name} (一) · 数形建模`,
        figure_number_line: nlProps,
        reasoning_items: contentPack.split.model_reasoning_items,
        conclusion_text: contentPack.split.model_conclusion,
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
        items: cb.reasoning_steps || contentPack.split.reasoning_fallback_items,
        conclusion_text: cb.core_rule || cb.conclusion || "",
        notes: `${guidance}（第2部分：重点从数轴直观升华到计数单位运算法则）`
      });
      return;
    }

    // 场景 B: 练习题量较多，触发题目页与答案页拆分 (教师显式指定版式时不擅自拆页)
    if (!layoutChoice.explicit && decision.needSplit && decision.splitMode === "practice_and_answer_dual_page") {
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

    // 场景 C: 长文本品读与多设问，触发原文品读与设问深究拆页 (教师显式指定版式时不擅自拆页)
    if (!layoutChoice.explicit && decision.needSplit && decision.splitMode === "text_reading_and_questions_dual_page") {
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
          ? contentPack.split.reading_conclusion_with_guide
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
        context_body: contentPack.split.reading_intro_body,
        questions: qs,
        conclusion_text: cb.core_rule || cb.key_phrase || contentPack.split.reading_conclusion_fallback,
        notes: `${guidance}（第2部分：结合设问引导学生深入探究修辞特色、感官协同与内在行文逻辑）`
      });
      return;
    }

    // 场景 D: 标准单页容纳 —— 版式来自映射/显式指定, 内容字段来自装配器
    if (!layoutChoice.layout) return; // 未映射的内容块类型: 保持历史行为 (不产页)
    const builder = PLAN_BUILDERS[cb.type];
    if (!builder) {
      throw new Error(`[page_planner] 版式映射将 ${cb.type} 指向 ${layoutChoice.layout}, 但该内容块类型没有页面装配器`);
    }
    const { key, ...fields } = builder({ cb, phase, meta, scenePreset, layout: layoutChoice.layout });
    slidePlans.push({
      slide_id: nextSlideId(key),
      phase_ref: phase.phase_id,
      layout: layoutChoice.layout,
      ...fields,
      notes: guidance
    });
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
  const endSubtitle = contentPack.end_subtitle || "认真练习，熟能生巧";

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
