# Implementation contract

Read SPECIFICATION.html, CODEX_START.md, TASKS.json and PROGRESS.md at session start.
Follow specification architecture and ordered prerequisites. Preserve the supplied specification.
Keep business rules in apps/api; web/ops access the API through server sessions.
All money is decimal strings backed by PostgreSQL NUMERIC. Never post using floating point.
Every mutation checks actor, resource scope, version and workflow state.
Do not mark a task done without its exact acceptance and minimum test evidence.
Keep TASKS.json, TASKS.md and PROGRESS.md synchronized. Release validation must fail unfinished tasks.
Reference evidence labels O/R/P/V are mandatory. Never invent measurements or parity approval.
Use Docker Compose for development. Never use floating container tags or commit generated secrets.
