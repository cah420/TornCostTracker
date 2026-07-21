import { migration001Bootstrap } from "./001-bootstrap.js";
import { migration002RawLogWarehouse } from "./002-raw-log-warehouse.js";

export const DATABASE_MIGRATIONS = [migration001Bootstrap, migration002RawLogWarehouse];
