# Realtime conversation recovery

M04 keeps the persisted API-owned message history as the replay authority. A native
HttpOnly server session and trusted application Origin authorize the single room at
upgrade. Every command and periodic one-second check revalidates the actual session
and current participant grant. Revoked assignment/membership/session closes the
existing socket with 1008. A client cannot address another conversation.

A strict subscribe command starts after the last received decimal-string BIGINT
sequence. Authorized ordered pages contain at most 100 messages; each work cycle
recovers at most twenty pages before yielding. Further cycles continue the same
cursor. A future cursor is rejected. Persisted database polling supports messages
committed through HTTP or another API instance without an in-memory broadcast being
the source of truth. Socket sends call the same atomic message port and receive a
receipt only after commit. Client-ID retries across transports return one receipt.

Native clients validate typed frames, merge by message ID in sequence order, and
reconnect with bounded exponential delay (one to thirty seconds). They retain the
last received sequence independently of read state. Connection feedback and manual
retry are visible. Access-ended rooms disable the composer without discarding drafts.
Payloads are capped at 32 KiB, compression is disabled, and a one-MiB output backlog
closes with a retryable connection status; reconnection recovers persisted rows.

A database-backed actor/minute admission limit permits sixty new messages. Committed
receipt retries remain allowed at the limit. One socket additionally caps commands
at 120 per minute. Admission retains no typed message text; old per-actor windows are
pruned on subsequent sends. The same business limit covers HTTP and socket writes.

## History usability correction

A seven-message browser journey exposed an inaccessible scroll region; history now
has keyboard focus and log semantics. Reading older history preserves the scroll
position and does not auto-mark unseen incoming messages read. Returning to the
bottom/visible page advances the own cursor. Loaded drafts remain in their rooms.
Original private chat geometry/parity and production deployment remain unverified.
