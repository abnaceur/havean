# Conversation selection and read state

M03 uses a shared native consumer/professional inbox. The conversation UUID and list
page live in the URL, including history navigation and reload. An unavailable
requested thread remains an explicit error instead of silently selecting another
thread. Conversation labels contain recorded category and current participant names.
The list uses bounded creation-order pages; message history starts with the latest
100 rows and can load older ordered pages. Decimal-string BIGINT after cursors also
prepare ordered reconnect replay without a 500-message truncation.

Read cursors belong to the actual actor and conversation. Current grant checks and
conversation row locking precede creation/update. SQL guards require own identity,
current access, optimistic row version, monotonic sequence and a committed message.
A matching retry is a no-op; conflicting concurrent writers cannot regress state.
Unread counts exclude own messages and count incoming sequences beyond the actor’s
cursor. No fabricated historical read times are backfilled. Personal export includes
only the actor’s cursor metadata.

The UI saves a cursor after rendering the latest retrieved messages in a visible
page. Failed read updates remain visible and retryable. Drafts/files remain mounted
per visited conversation during the inbox session, and an unconfirmed send stays in
the composer with explicit failure feedback. Saved message bubbles represent
committed rows, including rows recovered after a lost acknowledgement. A successful
receipt clears only that conversation’s draft. Realtime reconnection remains M04.

An initial browser assertion matched Next.js’s route announcer as well as the actual
composer alert; the corrected assertion scopes to the visible composer. The new
screens are local P evidence, not original-site parity or newly approved baselines.
