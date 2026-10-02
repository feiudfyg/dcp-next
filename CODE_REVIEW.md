# DCP (opencode-dcp) 代码审查报告

- 仓库：`@local/opencode-dcp` v3.1.15（OpenCode 动态上下文裁剪插件的本地 fork）
- 审查范围：`index.ts`、`tui.tsx`、`lib/**`、`scripts/**`、`tests/**`、构建与配置
- 代码规模：源文件 75 个 / 约 10,117 行；测试 21 个文件 / 约 4,894 行
- 运行环境：Node v24.11.0、TypeScript 6.0.2、Windows（`win32`）

---

## 1. 项目概览

DCP 是一个 OpenCode 插件，通过多种策略在不修改会话历史的前提下压缩对话上下文，从而降低 token 消耗：

- **compress 工具**：由模型主动调用，把已“关闭”的对话区间或单条消息替换为高保真技术摘要。支持两种模式：
    - `range`：压缩连续区间（`startId`/`endId` 使用 `mNNNN`/`bN` 边界）。
    - `message`：逐条消息压缩（实验特性）。
- **deduplication**：同工具 + 同参数只保留最近一次输出。
- **purgeErrors**：达到指定轮数后清除报错工具调用的输入（保留错误信息）。
- 提供 `/dcp`、`/dcp-compress`、`/dcp-panel` 等命令与一个 OpenTUI 面板。

核心机制：插件在 `experimental.chat.messages.transform` 钩子里就地改写将要发送给 LLM 的 `messages` 数组——用占位符/摘要替换被裁剪内容，并注入消息 ID 元数据标签与压缩提醒（nudge）。会话的持久化状态保存在 `~/.local/share/opencode/storage/plugin/dcp/{sessionId}.json`。

## 2. 架构与模块职责

```
index.ts              插件入口：装配 config/state/prompts，注册 hooks、compress 工具、命令
tui.tsx               OpenTUI 入口（以源码形式随包发布）
lib/
  config.ts           多层级配置加载/合并/校验（全局 → configDir → 项目）
  hooks.ts            4 个 hook 工厂：system prompt / messages transform / command.execute / event
  auth.ts             安全模式下的 Basic Auth 注入
  host-permissions.ts 解析 opencode 宿主的 permission 配置
  compress-permission.ts  当前会话的有效 compress 权限
  logger.ts           文件日志（debug 开关）
  message-ids.ts      mNNNN / bN 引用分配与 XML 标签生成
  protected-patterns.ts   glob 匹配、工具/文件保护
  token-utils.ts      token 计数与用量估算（Anthropic tokenizer）
  token-format.ts     数值格式化
  state/              SessionState 定义、持久化、工具缓存、状态工具
  messages/           裁剪、注入（消息 ID / nudge / 子代理结果）、优先级、形状过滤
  compress/           range/message 两个工具的实现、搜索、受保护内容、状态应用、计时
  strategies/         deduplication / purge-errors
  commands/           /dcp 各子命令处理器
  prompts/            PromptStore（内置默认 + 用户覆盖）与提示词常量
  ui/                 聊天通知与格式化
  tui/                OpenTUI 面板、对话框、数据装配
```

## 3. 关键数据流（messages transform）

`lib/hooks.ts` → `createChatMessageTransformHandler`：

1. `filterMessagesInPlace` 过滤形状异常的消息；
2. `checkSession` 检测会话切换 / 原生 compaction，并按需初始化或重置状态；
3. `syncCompressPermissionState` 计算有效权限；
4. 子代理会话且未开启 `allowSubAgents` 时直接返回；
5. `stripHallucinations` → 缓存系统提示词 token → `assignMessageRefs`；
6. `syncCompressionBlocks` → `syncToolCache` → `buildToolIdList` → `prune`；
7. `injectExtendedSubAgentResults` → `buildPriorityMap` → `injectCompressNudges` → `injectMessageIds`；
8. `applyPendingManualTrigger` → `stripStaleMetadata` → 落盘调试上下文。

`compress` 工具体（`lib/compress/range.ts` / `message.ts`）流程：`prepareSession`（刷新手动模式 → `ask` 权限 → 拉取消息 → 初始化 → 重算 dedup/purge）→ 解析/校验选区 → 注入占位符与受保护内容 → `applyCompressionState` 更新状态机 → `finalizeSession`（写盘 + 通知）。

裁剪状态机的核心是 `CompressionBlock`：每个块记录 `effectiveMessageIds/effectiveToolIds`、被其“消费”的旧块（`consumedBlockIds`）、父块（`parentBlockIds`）等，`syncCompressionBlocks` 每次请求都会按来源消息是否仍在会话来重算 active 集合。

## 4. 构建与校验结果（本次实测）

| 命令                                                   | 结果                                                           |
| ------------------------------------------------------ | -------------------------------------------------------------- |
| `npm run typecheck` (`tsc --noEmit`)                   | ✅ 通过，0 错误                                                |
| `npm test`                                             | ✅ 118 passed / 0 failed（21 个测试文件）                      |
| `npm run build` (`tsup` + `tsc --emitDeclarationOnly`) | ✅ 成功，`dist/index.js` + `dist/index.d.ts` + `dist/tui.d.ts` |
| `npm run verify:package`                               | ✅ `package verification passed`，tarball 236 entries          |
| `npm run format:check`                                 | ❌ **失败：91 个文件不符合 Prettier 格式**（见 M-1）           |

Git 工作区干净，最近提交集中在 compress/prompt/命令注册等特性与修复。

---

## 5. 值得肯定之处

- **分层清晰**：config / state / messages / compress / commands / prompts / ui / tui 边界明确，纯函数与副作用分离良好。
- **防御式设计**：`isMessageWithInfo` / `filterMessagesInPlace` 形状校验；`loadPruneMessagesState` 对持久化数据逐字段清洗（数字、数组、去重、越界过滤），可容忍脏状态文件。
- **语义稳健**：`syncCompressionBlocks` 在每次请求重算 active 块，来源消息消失时自动失效；`stripHallucinations` 处理了大量模型“幻觉标签”形态（issues #555/#556 有对应测试）。
- **可复现性**：合成消息/片段 ID 用 `sha256(seed)` 前 16 字节生成（`lib/messages/utils.ts`），避免每次请求内容漂移而破坏 prompt 缓存。
- **安全相关无高危**：无 `eval`/动态代码执行；`matchesGlob` 对正则元字符做转义；未发现硬编码密钥或注入面。
- **测试质量高**：118 个用例覆盖压缩状态机、权限解析（含无 `Array.findLast`/`Object.hasOwn` 的兼容路径）、消息 ID、token 计数、prompt 覆盖、Windows 路径分隔符等边角。
- **打包防护**：`scripts/verify-package.mjs` 校验入口/类型文件、CJS 依赖引入风险与 tarball 内容白/黑名单，能有效防止误发布。

---

## 6. 问题清单

### 🔴 严重（Correctness）

**H-1 配置文件的语法错误会被静默忽略**
`lib/config.ts:841-858` 的 `loadConfigFile` 用 `try/catch` 包裹 `parse(...)`，并依赖其抛异常来产出 `parseError`。但 `jsonc-parser` 的 `parse` **不会**对语法错误抛异常，而是返回“尽力解析”的部分结果，错误需要通过传入的 `errors` 数组读取。本次实测：

```
输入: { "enabled": tru, "debug": }
parsed = {}            // 不抛异常
errors = [InvalidSymbol, ValueExpected, ValueExpected]
```

后果：只要内容能解析出非 `undefined` 的值，`loadConfigFile` 就返回 `{ data }` 而不返回 `parseError`，`scheduleParseWarning`（`lib/config.ts:1016`）不会触发；损坏的配置会被当作（部分/空）有效配置合并，用户既看不到告警，配置也可能被悄悄忽略。
建议：传入 `errors` 数组并在非空时报错，例如
`const errors: ParseError[] = []; const parsed = parse(content, errors, {...}); if (errors.length) return { data: null, parseError: printParseErrorCode(errors[0].error) }`。此路径目前**无任何测试**。

### 🟠 中等（Maintainability / Metrics / Robustness）

**M-1 行尾符导致仓库不满足自身的格式化约束**
`npm run format:check` 失败 91 个文件。`.prettierrc` 未设置 `endOfLine`（默认 `lf`），而实测 109 个受管文本文件中有 **88 个使用 CRLF**、21 个为 LF。仓库无 `.gitattributes` 约束，Windows 上极易漂移。
影响：CI/本地格式化校验必然失败；`git diff` 噪声大。
建议：新增 `.gitattributes`（`* text=auto eol=lf`，对 `*.png` 等二进制声明 `binary`），并在 `.prettierrc` 显式设 `endOfLine: "lf"`，随后统一执行 `npm run format`。

**M-2 token 统计口径不一致，存在重复计数的可能**

- `lib/compress/state.ts:268-270`：`pruneTokenCounter += compressedTokens; totalPruneTokens += pruneTokenCounter; pruneTokenCounter = 0`（“刷新”语义）。
- `lib/strategies/deduplication.ts:85` 与 `lib/strategies/purge-errors.ts:79`：直接 `totalPruneTokens += ...`，绕过 counter。
- `lib/commands/sweep.ts:229-231` 又用刷新语义；`lib/commands/decompress.ts:252` 会从 `totalPruneTokens` 中**扣减**恢复的 token；`lib/commands/recompress.ts:201` 再加回。

同一批工具先被 dedup 计入 `totalPruneTokens`、之后又被 compress 计入 `compressedTokens`，会出现重复累加。“累计节省”因此不是可靠指标（`stats` 命令与通知都会展示它）。
建议：统一账户模型——要么只有“增量事件”累加、要么只由 counter 刷新；并明确 all-time 与 session 的口径。

**M-3 大量死代码**

- `lib/messages/prune.ts:29-73` 的 `pruneFullTool` 仅在 `:23` 被注释掉的调用引用。
- `lib/ui/notification.ts` 的整套“统一裁剪通知”路径未被使用：`PruneReason`、`PRUNE_REASON_LABELS`(`:13-18`)、`sendUnifiedNotification`(`:92`)、`buildMinimalMessage`/`buildDetailedMessage` 均无调用点（trim 后约 120 行）。
- `lib/ui/utils.ts:289` `formatPruningResultForTool`、`lib/token-utils.ts:140` `countMessageTextTokens` 无引用。

影响：误导维护者、增加测试与打包体积、掩盖真实入口。
建议：删除或加 `@deprecated` 注释与说明。

**M-4 compress 工具注册时机早于宿主权限判定**
`index.ts:78-85` 在工厂函数返回时依据 `config.compress.permission !== "deny"` 决定是否注册工具；而把宿主 opencode 的 deny 反映到 `config.compress.permission` 的逻辑在 `config` 异步回调里（`index.ts:86-135`，含 `compressDisabledByOpencode`）。当宿主（全局或 agent）以 `compress: "deny"` 禁止时，工具仍会被注册，只是后续有效权限为 deny。
影响：模型仍可能看到并调用该工具（依赖宿主的权限层拦截）。
建议：把“是否注册工具”收敛到 config 回调完成之后，或在工具描述/执行入口显式返回 deny 提示。

**M-5 部分缓存无上界**
`state.toolParameters` 有 FIFO 裁剪（`lib/state/tool-cache.ts:85`，上限 1000），但 `state.subAgentResultCache`（`lib/state/state.ts:104`，`subagent-results.ts` 写入）从不裁剪；`state.compressionTiming.startsByCallId` 只在特定状态迁移时删除（`lib/hooks.ts:379-383`）。长会话下存在缓慢内存增长。
建议：为 `subAgentResultCache` 增加与 `toolParameters` 类似的容量上限。

**M-6 Logger 覆写全局 `Error.prepareStackTrace`**
`lib/logger.ts:47-68` 在 `finally` 中恢复，但在并发/异步场景下全局状态仍可能被短暂破坏，且每次日志都会构造并遍历调用栈。仅在 `debug` 开启时执行，影响可控，但属于已知的全局副作用模式。
建议：改用 `Error.captureStackTrace` + 更轻量的偏移，或直接记录固定模块名而非推导调用方文件。

### 🟡 轻微（Nits / Consistency）

- **L-1** `lib/message-ids.ts:30-32` 报错信息写 “Supported range is 0-9999”，但 `MESSAGE_REF_MIN_INDEX = 1`，应为 `1-9999`。
- **L-2** `lib/config.ts:760-774` 的 `findOpencodeDir` 调用 `statSync` 未做 `try/catch`；`lib/prompts/store.ts` 中的同名函数（隐藏段）加了 `try/catch`。两个实现重复且行为不一致，建议合并去重。
- **L-3** `lib/hooks.ts:115-123`：当 `output.messages` 非数组时，`filterMessagesInPlace` 会返回新数组，但后续仍以 `output.messages` 继续传递。极端输入下会继续带着非数组对象往下走。建议直接使用过滤后的返回值。
- **L-4** `lib/config.ts:685` 与 `:1016-1029` 用硬编码 `setTimeout(..., 7000)` 延迟弹配置告警。魔法数字、且依赖 TUI 已就绪的隐含假设，建议改为显式就绪信号或事件队列。
- **L-5** `lib/auth.ts:24` 访问 `client._client || client.client` 私有字段并 `.use()` 注入拦截器，SDK 结构变化时会静默失效；同时引用了环境相关的全局 `Request` 类型。建议通过 SDK 公开能力或最小化耦合，并在未命中时记一条 warn。
- **L-6** 逻辑重复：`formatDuration`/`formatRatio`/`pct` 在 `lib/ui/utils.ts` 与 `lib/tui/format.ts` 各有一份；`getCurrentTokenUsage` / `analyzeContextTokens` / `cacheSystemPromptTokens` 共享“首个 assistant 的 input+cache”推导但各写一份。
- **L-7** 类型宽松：约 25 处 `: any`，`client: any` 遍布各模块，SDK 类型（`@opencode-ai/sdk`）未被充分利用（如 `WithParts`、`Part` 已在用，但 client 完全 any），削弱了类型保护。
- **L-8** 文档漂移：`scripts/README.md` 描述的 CLI 参数（`--system`/`--nudge`/`--context-tools` …）与 `scripts/print.ts` 实际支持（`--list`/`--show`/`--system-manual` …）不一致。
- **L-9** `tests/test-dcp-cache.sh` 不被 `npm test`（仅 `tests/*.test.ts`）执行，属于游离脚本，需确认是否仍有效或移除。
- **L-10** `lib/compress/pipeline.ts:50` 无条件调用 `toolCtx.ask({permission:"compress", ...})`，即便权限为 `allow` 也会走一次 ask；确认宿主在 allow 下是廉价 no-op。

---

## 7. 安全性评估

- **认证**：`lib/auth.ts` 仅在 `OPENCODE_SERVER_PASSWORD` 存在时注入 `Authorization: Basic`，用户名默认 `opencode`；未在任何地方记录密码。✅
- **敏感数据落盘**：`Logger.saveContext`（`lib/logger.ts:209`）与通知会把消息内容写入 `~/.config/opencode/logs/dcp/`，仅在 `debug: true` 时发生。属预期行为，但文档应提醒 debug 日志可能含敏感代码/提示词。
- **注入面**：未发现 shell/命令拼接、动态 `require`、`eval`、`Function()` 或反序列化。glob 匹配对手工构造的正则做了元字符转义；未见明显 ReDoS（用户可控 pattern 长度有限）。
- **依赖**：`overrides` 固定了 `@babel/core`、`esbuild`；`jsonc-parser` 因 ESM 引入损坏被 `tsup` 内联打包（`tsup.config.ts`），`verify-package.mjs` 亦专门放行并管控其引入风险。✅

## 8. 性能评估

- **Tokenizer 开销**：`@anthropic-ai/tokenizer` 初始化/调用成本显著（测试中单次相关用例约 590ms）。`countTokens` 在裁剪决策路径上被多次调用（`countAllMessageTokens`、`getCurrentTokenUsage`、`analyzeContextTokens` 等）。已有 `toolParameters.tokenCount` 做部分缓存，但消息级 token 未缓存。
  建议：按消息 ID 缓存 token 计数并在消息变化时失效。
- **持久化写入**：`saveSessionState` 每次全量 `JSON.stringify` 落盘，且在 messages transform、通知、命令等多条路径上频繁 `void saveSessionState(...)`（`lib/state/persistence.ts:80`）。长会话 JSON 变大后可能成为热点。建议去抖/合并写。
- **通知**：`sendIgnoredMessage` 通过 `client.session.prompt({ noReply:true, ignored:true })` 发送，属于网络往返；命令触发时才发生，可接受。

## 9. 测试评估

- 覆盖良好：压缩 range/message 全流程、去重/错误清理、权限解析、消息 ID、token 计数、prompt 覆盖安全、Windows 路径。
- **缺口**：
    - `lib/config.ts` 的加载/合并/类型校验/非法键检测**完全没有测试**（同时是 H-1 的重灾区）。
    - `lib/auth.ts`、`lib/logger.ts`、`lib/tui/**` 无测试。
    - `command.execute.before` 的路由（子命令分发、manual trigger 的 `__DCP_MANUAL_TRIGGER_BLOCKED__` 分支）覆盖不足。

## 10. 结论与优先级建议

总体质量**良好**：结构清晰、防御性强、测试扎实、构建与打包校验完备，无高危安全问题。主要风险集中在**配置解析的静默失败（H-1）**与**仓库未通过自身格式校验（M-1）**，其次是死代码与统计口径不一致。

建议处理顺序：

1. **H-1** 修复配置解析错误检测，并补 `lib/config.ts` 测试；
2. **M-1** 添加 `.gitattributes` + `endOfLine`，全量 `format`；
3. **M-3** 删除死代码（含 `notification.ts` 未用路径）；
4. **M-2** 统一 token 统计口径；
5. **M-4 / M-5 / M-6** 按需处理；其余轻微项可纳入日常清理。

---

## 附录：复现命令

```bash
npm run typecheck         # 通过
npm test                  # 118 passed
npm run build             # 产出 dist/index.js + d.ts
npm run verify:package    # 打包校验通过
npm run format:check      # 失败（CRLF，见 M-1）
```
