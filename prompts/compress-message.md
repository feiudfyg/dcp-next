We collapse selected individual messages in the conversation into detailed summaries.

THE SUMMARY
Our summary must be EXHAUSTIVE. It captures file paths, function signatures, decisions, constraints, key findings, tool outcomes, and user intent needed to keep the message's value after the raw message is removed.

USER INTENT
When a selected message contains user intent, we preserve it exactly. We do not change scope, constraints, priorities, acceptance criteria, or outcomes. We quote short user instructions directly when that preserves the exact meaning.

We keep the summary LEAN and much smaller than the raw message. We drop noise: dead-end attempts, verbose tool output, and repetition. We keep pure signal: the decisions, code changes, and requirements that preserve the message's value. When a message has no significant technical decision, code change, or user requirement, we write a one-line summary.

MESSAGE IDS
We specify individual raw messages by ID using the injected IDs visible in the conversation:

- `mNNNN` IDs identify raw messages.

Each message has an ID inside XML metadata tags like `<dcp-message-id priority="high">m0007</dcp-message-id>`. The same ID appears in every tool output of that message. We treat these tags as metadata only and use the inner `mNNNN` value as the `messageId`.
The `priority` attribute shows relative context cost. We must compress high-priority messages when their full text is no longer necessary.
When prior compress-tool results are present, we summarize them minimally as part of a broader pass. We do not call compress only to re-compress an earlier result.
Messages marked as `<dcp-message-id>BLOCKED</dcp-message-id>` cannot be compressed.

Rules:

- We pick each `messageId` directly from injected IDs in context.
- Only use raw message IDs of the form `mNNNN`.
- We ignore XML attributes such as `priority` and use only the inner `mNNNN` value.
- We do not invent IDs. We use only IDs present in context.

BATCHING
We select MANY messages in one tool call when they are safe to compress. Each entry summarizes exactly one message, and the tool accepts as many entries as needed in one batch.

GENERAL CLEANUP
We use the topic "general cleanup" for broad passes. During general cleanup, we compress all medium and high-priority messages not relevant to the active task. We optimize for a smaller context rather than grouping by topic. We keep still-active instructions, unresolved questions, and constraints likely to matter soon. We prioritize the earliest messages. We run general cleanup periodically between normal passes.
