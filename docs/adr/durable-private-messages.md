# Durable private messages

M02 commits the message, monotonically ordered PostgreSQL BIGINT sequence,
attachment bindings and outbox event before returning its receipt. Sequence values
travel as decimal strings. An actor/client-ID advisory lock and current conversation
row lock serialize retries and sequence allocation. Reusing an ID with different
content/context fails; a committed matching retry returns the same message. Current
participant access is required even for replay. SQL guards prohibit forged senders,
context versions, sequences and modification of committed messages.

Message bodies are normalized plain text. React text nodes render markup inert;
no HTML interpretation is used. Files require an explicit sharing declaration, a
fresh conversation-bound private upload, owner/room/version checks and existing
F12 scanning. Upload tickets include actor, asset and conversation versions.
Attachment rows commit with their message and cannot be appended afterward.
Downloads recheck current participants and stream private bucket bytes with no-store;
images use sanitized WebP variants. Revoked assets remain explicitly unavailable.
Uploads and sent attachment metadata join the scoped personal export.

The shared consumer/professional composer retains draft, file state and client ID
when acknowledgement is lost. Retrying checks the same receipt and clears the draft
only after acknowledgement. This stage retains existing polling; unread cursors and
reconnect replay continue in M03–M04.

## Verification corrections

Immutable conversation_uploads has no UPDATE RLS policy. FOR SHARE therefore locks
only the mutable asset/conversation rows, while explicit joins still validate the
immutable binding. An early desktop test matched reply text in the composer before
commit; the final assertion waits for the persisted message bubble instead.
Historical approved screenshots are preserved. New message screenshots are P,
not reference parity or additional human baseline approval.
