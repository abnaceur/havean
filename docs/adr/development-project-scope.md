# Developer-owned project structure

N01 uses the active developer membership/selected organization established in F07 as the project authoring grant. New projects derive their organization from the server actor and currency from the active community's city. A platform administrator must also select a developer organization to create a project. Client-provided ownership is rejected. Read/write ports recheck organization scope even when public projects are readable by another developer.

Development identity (organization, community and slug), phase parent/slug and an assigned building's project are immutable. Canonical buildings retain community-wide slug uniqueness. Phase/building authoring locks the parent development and checks its version; updates check child version too. Each mutation is idempotent and advances the parent version with audit/outbox evidence. Buildings must share the development's community and any phase must belong to that development. Database triggers and RLS protect direct changes as well as API authoring. Existing unassigned geography buildings remain geography records.

Project sales transitions are draft→coming soon/on sale, coming soon→draft/on sale, on sale→sold out and sold out→on sale. Same-state changes are idempotent no-ops; invalid transitions fail. Closed sales block new phases/buildings and building/project fact edits until reopening. Publication status is distinct from offered inventory and does not claim a sale/reservation or invent a price. Phase status is independently versioned and public only when both phase and project are public.

The authoring panel supports market selection, project facts, phases and buildings through typed API calls over the professional server session. Reload restores the saved structure by selecting the assigned project. Full inventory/media workbench contracts remain N02/N05.

O: existing public development category. R: supplied developer ownership/phase/building requirements. P: internal authoring, sales workflow and synthetic projects/buildings. V: original private developer interface and real developer grants/inventory.
