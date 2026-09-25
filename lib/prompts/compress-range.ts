export const COMPRESS_RANGE = `We collapse a range in the conversation into one detailed summary.

THE SUMMARY
Our summary must be EXHAUSTIVE. It captures file paths, function signatures, decisions, constraints, key findings, and everything needed to keep context integrity. We write an authoritative record, faithful enough that the original conversation adds no value.

USER INTENT
When the range includes user messages, we preserve the user's intent exactly. We do not change scope, constraints, priorities, acceptance criteria, or outcomes. We quote short user messages directly when that preserves the exact meaning.

We keep the summary LEAN and much smaller than the content it replaces. We drop noise: dead-end attempts, verbose tool output, and back-and-forth exploration. We keep pure signal: the file paths, decisions, constraints, and findings that preserve full understanding with no ambiguity. We omit narration and anything the reader can re-derive.

COMPRESSED BLOCK PLACEHOLDERS
When the range includes previously compressed blocks, we reference each with its exact placeholder:

- \`(bN)\`

Compressed block sections appear in context with the header:

- \`[Compressed conversation section]\`

Compressed block IDs use the \`bN\` form (never \`mNNNN\`) and the same XML metadata tag format.

Rules:

- We reference each prior block we keep with its exact \`(bN)\` placeholder.
- We do not invent placeholders for blocks outside the range.
- We treat \`(bN)\` placeholders as RESERVED TOKENS. We emit \`(bN)\` text only as intentional placeholders.
- When we mention a block in prose, we write plain text like \`compressed bN\`.
- We keep every \`(bN)\` placeholder unique and inside the selected range.

Placeholders are semantic references. The tool replaces them with the full stored compressed block content.

FLOW PRESERVATION
We write the summary so it still reads correctly after placeholder expansion.

- We treat each placeholder as a stand-in for a full conversation segment.
- We keep transitions before and after each placeholder chronological and causal.
- We do not write text that depends on the placeholder staying literal.
- Our meaning stays coherent once each placeholder is replaced.

BOUNDARY IDS
We specify boundaries by ID using the injected IDs visible in the conversation:

- \`mNNNN\` IDs identify raw messages.
- \`bN\` IDs identify previously compressed blocks.

Each message has an ID inside XML metadata tags like \`<dcp-message-id>...</dcp-message-id>\`. The same ID appears in every tool output of that message. We treat these tags as boundary metadata only.

Rules:

- We pick \`startId\` and \`endId\` directly from injected IDs in context.
- IDs must exist in the current visible context.
- \`startId\` must appear before \`endId\`.
- We do not invent IDs. We use only IDs present in context.

BATCHING
When independent ranges are ready and their boundaries do not overlap, we include all of them as separate entries in the \`content\` array of a single tool call. Each entry has its own \`startId\`, \`endId\`, and \`summary\`.
`
