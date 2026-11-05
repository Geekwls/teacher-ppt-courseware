// -*- coding: utf-8 -*-
import test from "node:test";
import assert from "node:assert/strict";
import {
  evalSimpleArithmetic,
  checkArithmeticInText,
  verifyStemAnswer,
  verifyJudgeProblem,
  validateSlideMathSemantics
} from "../plugin/skills/lesson-courseware/lib_js/math_solver.js";

test("math_solver: 基本四则运算求值", () => {
  assert.equal(evalSimpleArithmetic("30", "×", "4"), 120);
  assert.equal(evalSimpleArithmetic("500", "*", "6"), 3000);
  assert.equal(evalSimpleArithmetic("100", "+", "20"), 120);
  assert.equal(evalSimpleArithmetic("80", "-", "30"), 50);
  assert.equal(evalSimpleArithmetic("600", "÷", "3"), 200);
  assert.equal(evalSimpleArithmetic("10", "÷", "0"), null);
});

test("math_solver: 文本中的直接算式校验", () => {
  // 正确算式
  const okIssues = checkArithmeticInText("先算 20 × 3 = 60，再算 200 × 3 = 600");
  assert.equal(okIssues.length, 0);

  // 错误算式
  const errIssues = checkArithmeticInText("学生算出 30 × 4 = 150，显然算错了");
  assert.equal(errIssues.length, 1);
  assert.equal(errIssues[0].statedVal, 150);
  assert.equal(errIssues[0].actualVal, 120);
});

test("math_solver: 单空与多空填空题答案校验", () => {
  // 单空题正确
  const res1 = verifyStemAnswer("30 × 4 = （    ）", "120 (想: 3个十乘4)");
  assert.equal(res1, null);

  // 单空题错误
  const res2 = verifyStemAnswer("30 × 4 = （    ）", "150 (算错)");
  assert.notEqual(res2, null);
  assert.equal(res2.correctVal, 120);
  assert.equal(res2.givenVal, 150);

  // 多空题正确
  const res3 = verifyStemAnswer("20×3=(  ), 200×3=(  )", "60;600");
  assert.equal(res3, null);

  // 多空题第2空错误
  const res4 = verifyStemAnswer("20×3=(  ), 200×3=(  )", "60;700");
  assert.notEqual(res4, null);
  assert.equal(res4.correctVal, 600);
  assert.equal(res4.givenVal, 700);
});

test("math_solver: 判断题逻辑矛盾校验", () => {
  // 正常判断题 (题干为假，选B错误)
  const okJudge = verifyJudgeProblem(
    "判断题：400 × 2 的积是 80。（    ）",
    ["A. 正确", "B. 错误"],
    "B（400是4个百，4个百×2=8个百=800，非80）"
  );
  assert.equal(okJudge, null);

  // 矛盾判断题 (题干为假，但误选A正确)
  const badJudge = verifyJudgeProblem(
    "判断题：400 × 2 的积是 80。（    ）",
    ["A. 正确", "B. 错误"],
    "A（400乘2得80）"
  );
  assert.notEqual(badJudge, null);
  assert.match(badJudge.message, /逻辑矛盾.*命题为【假】.*答案选择了【正确】/);
});

test("math_solver: 幻灯片级别易错警示与例题校验", () => {
  // misconception 页面: 允许 wrong_case 错误，但 correct_solution 必须正确
  const slideMisconception = {
    type: "misconception",
    slide_id: "s07",
    wrong_case: "50 × 6 = 30", // 故意写错
    correct_solution: "50 × 6 = 300" // 正解正确
  };
  const issues = validateSlideMathSemantics(slideMisconception);
  assert.equal(issues.length, 0);

  // 若 correct_solution 写错则报错
  const badMisconception = {
    type: "misconception",
    slide_id: "s07",
    wrong_case: "50 × 6 = 30",
    correct_solution: "50 × 6 = 350" // 算错
  };
  const badIssues = validateSlideMathSemantics(badMisconception);
  assert.equal(badIssues.length, 1);
  assert.equal(badIssues[0].code, "MATH_ARITHMETIC_ERROR");
});
