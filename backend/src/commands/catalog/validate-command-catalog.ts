import { COMMAND_CATALOG } from "./index.js";
import { validateCommandCatalog } from "./command-catalog-validator.js";

const result = validateCommandCatalog(COMMAND_CATALOG);
console.log(`Command catalog valid: ${result.count} items`);
