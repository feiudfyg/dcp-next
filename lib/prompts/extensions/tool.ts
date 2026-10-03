// These format schemas are kept separate from the editable compress prompts
// so they cannot be modified via custom prompt overrides. The schemas must
// match the tool's input validation and are not safe to change independently.

export const RANGE_FORMAT_EXTENSION = `
THE FORMAT OF COMPRESS

\`\`\`
{
  topic: string,           // Short label (3-5 words) - e.g., "Auth System Exploration"
  content: [               // One or more ranges to compress
    {
      startId: string,     // Boundary ID at range start: mNNNN or bN
      endId: string,       // Boundary ID at range end: mNNNN or bN
      summary: string,     // Complete technical summary replacing all content in range
      replaceBlockIds?: string[]  // Prior blocks to REPLACE (drop their old summaries), e.g. ["b7"]. Only for blocks we are deliberately re-compressing.
    }
  ]
}
\`\`\``

export const RANGE_PRIOR_BLOCKS_EXTENSION = `
PRIOR COMPRESSED BLOCKS

Previously compressed blocks are normal compressible content. They are not off-limits.
We may use \`bN\` as range boundaries, include prior blocks in a new range, and
re-compress them. We do not limit compression to the newest uncompressed messages.
Prior block summaries are visible in context as \`[Compressed conversation section]\`.

By default a prior block covered by a range is KEPT: its stored summary stays (expanded
from its \`(bN)\` placeholder, or appended automatically if we omit it).`

export const RANGE_PRIOR_SUMMARY_DROP_EXTENSION = `
REPLACING PRIOR SUMMARIES

A prior block covered by a range is kept by default. To DROP a prior summary and replace
it with ours, list its block ID in \`replaceBlockIds\` for that range entry. Listed blocks
are removed, so our new summary MUST cover their essential content in condensed form.

\`replaceBlockIds\` is authoritative. A block that is inside the range AND listed is
REPLACED, even when the range boundary is that same \`bN\`. We never need to avoid using a
\`bN\` as a boundary when we are replacing it, and we must not write its \`(bN)\` placeholder.

Correct - replace the summary of a block we just compressed:
  { "startId": "b7", "endId": "b7", "replaceBlockIds": ["b7"], "summary": "<new complete summary>" }

Correct - keep a prior block while writing a new summary around it (do NOT list it):
  { "startId": "b7", "endId": "m0200", "summary": "<new material> ... (b7) ... <new material>" }

How to choose:
- Replacing a block's summary -> list it in \`replaceBlockIds\`.
- Keeping a block (even nested) -> do NOT list it; it is preserved automatically.
- Every listed block must be inside the selected range, e.g. use the block's own \`bN\` as both boundaries.`

export const RANGE_PRIOR_SUMMARY_PRESERVE_EXTENSION = `
PRESERVING PRIOR SUMMARIES

Every required prior block is preserved. Include each \`(bN)\` placeholder exactly once.
\`replaceBlockIds\` is ignored while \`allowPriorSummaryDrop\` is disabled.`

export const MESSAGE_FORMAT_EXTENSION = `
THE FORMAT OF COMPRESS

\`\`\`
{
  topic: string,           // Short label (3-5 words) for the overall batch
  content: [               // One or more messages to compress independently
    {
      messageId: string,   // Raw message ID only: mNNNN (ignore metadata attributes like priority)
      topic: string,       // Short label (3-5 words) for this one message summary
      summary: string      // Complete technical summary replacing that one message
    }
  ]
}
\`\`\``
