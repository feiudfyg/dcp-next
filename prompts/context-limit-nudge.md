CRITICAL WARNING: MAX CONTEXT LIMIT REACHED

We are at or beyond the configured max context threshold. This is an emergency.

We MUST use the `compress` tool now. We do not continue normal exploration until compression is handled.

If we are in the middle of a critical atomic operation, we finish that step first, then compress immediately.

WHAT WE SELECT
We start from older, resolved history and capture as much stale context as safely possible in one pass. We avoid the newest active working messages unless they are clearly closed.

WHAT OUR SUMMARY COVERS
Our summary MUST cover all essential details so work can continue. When the range includes user messages, we preserve user intent exactly and prefer direct quotes for short messages.
