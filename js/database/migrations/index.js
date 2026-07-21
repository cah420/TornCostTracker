import { migration001Bootstrap } from "./001-bootstrap.js";
import { migration002RawLogWarehouse } from "./002-raw-log-warehouse.js";
import { migration003CanonicalEvents } from "./003-canonical-events.js";
import { migration004TornLogTypeCatalog } from "./004-torn-log-type-catalog.js";

export const DATABASE_MIGRATIONS = [migration001Bootstrap, migration002RawLogWarehouse, migration003CanonicalEvents, migration004TornLogTypeCatalog];
