# acceptance/lesson_plans — 回归金样（只读测试夹具）

这里是**流水线回归测试的基线**：`npm test` 与 `npm run test:matrix` 会把每份
金样跑一遍完整构建流水线，断言几何体检 0 Critical、讲稿完备、分步时序合规；
`test/snapshots/presentations/` 中还锁定着每份金样的表现 AST 快照——任何重构
都不允许改变它们的产物。

## 目录组织

按学科分域：`math/`、`chinese/`、`english/`。
当前 6 份，覆盖三科 × 新授/练习/复习三种课型（含初一语文试点）。

## 纪律

- **只读**。这里代表"已知正确答案"：修改任何一份 = 修改考卷，必须同步运行
  `npm run test:update-snapshots` 生成新快照并在 PR 中人工审阅 diff、说明理由。
- **晋级制**：新金样只从 `content/lesson_plans/` 中"晋级"产生——当某个学科或
  课型尚无任何金样覆盖、且该课已被确认为标准形态时，复制一份到此并补快照。
  不要把金样当网盘：每晋一级都要养快照、跑全量矩阵。
- 文件命名与 `content/lesson_plans/README.md` 中的规范一致（`{subject}_g{年级}_t{册}_u{单元}_l{课时}…`），
  `caseId` 即文件名去 `.json`，也是对应快照的文件名。
