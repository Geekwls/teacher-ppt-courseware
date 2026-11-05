// -*- coding: utf-8 -*-
/**
 * 小学数学算式与答案语义校验引擎 (math_solver.js)
 *
 * 核心能力:
 * 1. 算术等式真实性校验 (防止大模型幻觉出现 30 × 4 = 150 等算错问题)；
 * 2. 练习题题干算式与参考答案数值对齐校验 (防止题干写对、答案算错)；
 * 3. 判断题/选择题题干命题真假与答案选项一致性校验 (防止反向选错)。
 */

/**
 * 安全计算单步双目整数四则运算
 */
export function evalSimpleArithmetic(a, op, b) {
  const numA = parseInt(a, 10);
  const numB = parseInt(b, 10);
  if (Number.isNaN(numA) || Number.isNaN(numB)) return null;

  switch (op) {
    case "+":
      return numA + numB;
    case "-":
      return numA - numB;
    case "×":
    case "*":
    case "x":
    case "X":
      return numA * numB;
    case "÷":
    case "/":
      return numB === 0 ? null : Math.floor(numA / numB);
    default:
      return null;
  }
}

/**
 * 校验文本中出现的直接算式等式 (如 30 × 4 = 120, 20 + 20 + 20 = 60)
 */
export function checkArithmeticInText(text, options = {}) {
  const issues = [];
  if (!text || typeof text !== "string") return issues;

  // 匹配形式: 120 + 30 = 150 或 30 × 4 = 120
  const regex = /(\d+)\s*([+\-×*xX÷/])\s*(\d+)\s*=\s*(\d+)/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const a = parseInt(m[1], 10);
    const op = m[2];
    const b = parseInt(m[3], 10);
    const statedVal = parseInt(m[4], 10);

    const actualVal = evalSimpleArithmetic(a, op, b);
    if (actualVal !== null && actualVal !== statedVal) {
      issues.push({
        type: "EQUATION_ERROR",
        raw: m[0],
        a,
        op,
        b,
        statedVal,
        actualVal,
        message: `算式计算错误: "${m[0]}" 应为 ${actualVal}，但写为 ${statedVal}`
      });
    }
  }

  return issues;
}

/**
 * 校验填空/计算题: 题干算式与答案数字是否匹配 (支持单空与多空按序校验)
 */
export function verifyStemAnswer(stem, answer) {
  if (!stem || !answer || typeof stem !== "string" || typeof answer !== "string") return null;

  // 1. 匹配所有待填空的等式: 必须等号后紧跟括号 ( ) 或 （ ）
  const blankRegex = /(\d+)\s*([+\-×*xX÷/])\s*(\d+)\s*=\s*[（\(]\s*[）\)]/g;
  const blankMatches = Array.from(stem.matchAll(blankRegex));

  if (blankMatches.length === 0) {
    return null;
  }

  // 将 answer 按分号、逗号或空白分割为候选答案项
  const rawParts = answer.split(/[;；,，\s]+/).map(s => s.trim()).filter(Boolean);
  const ansNums = [];
  for (const part of rawParts) {
    const m = part.match(/^(\d+)/);
    if (m) ansNums.push(parseInt(m[1], 10));
  }

  // 逐空比对
  for (let i = 0; i < blankMatches.length; i++) {
    const match = blankMatches[i];
    const a = parseInt(match[1], 10);
    const op = match[2];
    const b = parseInt(match[3], 10);
    const correctVal = evalSimpleArithmetic(a, op, b);

    if (correctVal !== null && i < ansNums.length) {
      const givenVal = ansNums[i];
      if (givenVal !== correctVal) {
        return {
          type: "STEM_ANSWER_MISMATCH",
          stemExpr: `${a} ${op} ${b}`,
          correctVal,
          givenVal,
          message: `题干算式 ${a} ${op} ${b} 正确结果为 ${correctVal}，但参考答案给出 ${givenVal}`
        };
      }
    }
  }

  return null;
}

/**
 * 校验判断题: 题干中的等式真假与答案选择项(A/B)是否一致
 */
export function verifyJudgeProblem(stem, options, answer) {
  if (!stem || !options || !answer || !Array.isArray(options)) return null;

  const isJudge = stem.includes("判断题") ||
    (options.length === 2 && options.some(o => o.includes("正确")) && options.some(o => o.includes("错误")));
  if (!isJudge) return null;

  // 匹配形如: 400 × 2 的积是 80 或 400 × 2 = 80
  const m = stem.match(/(\d+)\s*([+\-×*xX÷/])\s*(\d+)\s*(?:的积是|的和是|的差是|的商是|=|是)\s*(\d+)/);
  if (!m) return null;

  const a = parseInt(m[1], 10);
  const op = m[2];
  const b = parseInt(m[3], 10);
  const statedVal = parseInt(m[4], 10);

  const trueVal = evalSimpleArithmetic(a, op, b);
  if (trueVal === null) return null;

  const propositionIsTrue = (trueVal === statedVal);

  // 提取答案选择的字母 A 或 B
  const chosenOpt = (answer.match(/^\s*([A-Za-z])/)||[])[1]?.toUpperCase();
  if (!chosenOpt) return null;

  const optText = options.find(o => o.trim().toUpperCase().startsWith(chosenOpt));
  if (!optText) return null;

  const chosenIsTrue = optText.includes("正确") || optText.includes("对");
  const chosenIsFalse = optText.includes("错误") || optText.includes("错");

  if (propositionIsTrue && chosenIsFalse) {
    return {
      type: "JUDGE_LOGIC_CONTRADICTION",
      message: `判断题逻辑矛盾: 题干算式 ${a} ${op} ${b} 结果为 ${trueVal}，命题为【真】，但答案选择了【错误】(${chosenOpt})`
    };
  } else if (!propositionIsTrue && chosenIsTrue) {
    return {
      type: "JUDGE_LOGIC_CONTRADICTION",
      message: `判断题逻辑矛盾: 题干算式 ${a} ${op} ${b} 实际结果为 ${trueVal}（非 ${statedVal}），命题为【假】，但答案选择了【正确】(${chosenOpt})`
    };
  }

  return null;
}

/**
 * 校验幻灯片内部的数学语义正确性
 */
export function validateSlideMathSemantics(slide) {
  const issues = [];
  if (!slide || typeof slide !== "object") return issues;

  // 1. practice 课堂练习页
  if (slide.type === "practice" && Array.isArray(slide.items)) {
    slide.items.forEach((item, idx) => {
      const qNum = item._no || (idx + 1);

      // A. 填空题/计算题题干与答案比对
      const stemErr = verifyStemAnswer(item.stem, item.answer);
      if (stemErr) {
        issues.push({
          slide_id: slide.slide_id,
          code: "MATH_ANSWER_MISMATCH",
          message: `第 ${qNum} 题: ${stemErr.message}`
        });
      }

      // B. 判断题逻辑矛盾检测
      const judgeErr = verifyJudgeProblem(item.stem, item.options, item.answer);
      if (judgeErr) {
        issues.push({
          slide_id: slide.slide_id,
          code: "MATH_JUDGE_CONTRADICTION",
          message: `第 ${qNum} 题: ${judgeErr.message}`
        });
      }

      // C. 答案文本中的直接算式运算检测
      const eqIssues = checkArithmeticInText(item.answer);
      eqIssues.forEach(eq => {
        issues.push({
          slide_id: slide.slide_id,
          code: "MATH_ARITHMETIC_ERROR",
          message: `第 ${qNum} 题答案内部 ${eq.message}`
        });
      });
    });
  }

  // 2. example 例题页
  if (slide.type === "example") {
    const solEqs = checkArithmeticInText(slide.solution);
    solEqs.forEach(eq => {
      issues.push({
        slide_id: slide.slide_id,
        code: "MATH_ARITHMETIC_ERROR",
        message: `例题解答中 ${eq.message}`
      });
    });
    const ansEqs = checkArithmeticInText(slide.answer);
    ansEqs.forEach(eq => {
      issues.push({
        slide_id: slide.slide_id,
        code: "MATH_ARITHMETIC_ERROR",
        message: `例题答语中 ${eq.message}`
      });
    });
  }

  // 3. misconception 易错警示页 (跳过故意写错的 wrong_case，只严格检测 correct_solution)
  if (slide.type === "misconception") {
    const correctEqs = checkArithmeticInText(slide.correct_solution);
    correctEqs.forEach(eq => {
      issues.push({
        slide_id: slide.slide_id,
        code: "MATH_ARITHMETIC_ERROR",
        message: `易错警示正解中 ${eq.message}`
      });
    });
  }

  // 4. concept / warmup 等常规页面的关键结论与步骤检测
  if (slide.conclusion) {
    const concEqs = checkArithmeticInText(slide.conclusion);
    concEqs.forEach(eq => {
      issues.push({
        slide_id: slide.slide_id,
        code: "MATH_ARITHMETIC_ERROR",
        message: `关键结论中 ${eq.message}`
      });
    });
  }

  return issues;
}
