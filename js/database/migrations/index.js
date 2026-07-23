import { migration001Bootstrap } from "./001-bootstrap.js";
import { migration002RawLogWarehouse } from "./002-raw-log-warehouse.js";
import { migration003CanonicalEvents } from "./003-canonical-events.js";
import { migration004TornLogTypeCatalog } from "./004-torn-log-type-catalog.js";
import { migration005CoverageIntelligence } from "./005-coverage-intelligence.js";
import { migration006AccountingProjection } from "./006-accounting-projection.js";
import { migration007AccountingLedger } from "./007-accounting-ledger.js";
import { migration008CostLotFoundation } from "./008-cost-lot-foundation.js";
import { migration009FifoConsumption } from "./009-fifo-consumption.js";
import { migration010InventoryPosition } from "./010-inventory-position.js";

export const DATABASE_MIGRATIONS = [migration001Bootstrap, migration002RawLogWarehouse, migration003CanonicalEvents, migration004TornLogTypeCatalog, migration005CoverageIntelligence, migration006AccountingProjection, migration007AccountingLedger, migration008CostLotFoundation, migration009FifoConsumption, migration010InventoryPosition];
