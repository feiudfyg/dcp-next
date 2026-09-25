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
      summary: string      // Complete technical summary replacing all content in range
    }
  ]
}
\`\`\``

export const RANGE_PRIOR_BLOCKS_EXTENSION = `
PRIOR COMPRESSED BLOCKS

Previously compressed blocks are normal compressible content. They are not off-limits.
We may use \`bN\` as range boundaries, include prior blocks in a new range, and
re-compress them. We do not limit compression to the newest uncompressed messages.
Prior block summaries are visible in context as \`[Compressed conversation section]\`.`

export const RANGE_PRIOR_SUMMARY_DROP_EXTENSION = `
REPLACING PRIOR SUMMARIES

We re-compress an earlier summary by listing its block ID in \`replaceBlockIds\` for
that range entry. A listed block is removed, so our new summary MUST cover its
essential content in condensed form.

For every required prior block we do not list, we include its \`(bN)\` placeholder to
keep it. Omitted unlisted blocks are preserved automatically, so omission alone never
loses information.`

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
