import {
  GoalBoardProjectCatalog,
  type GoalBoardProjectCatalogOptions,
} from "./catalog.js";

/**
 * Runs a short-lived catalog operation and always releases its SQLite handle.
 * Long-lived owners should continue to manage an explicit catalog instance.
 */
export async function withGoalBoardProjectCatalog<T>(
  options: GoalBoardProjectCatalogOptions,
  operation: (catalog: GoalBoardProjectCatalog) => T | Promise<T>,
): Promise<T> {
  const catalog = await GoalBoardProjectCatalog.open(options);
  try {
    return await operation(catalog);
  } finally {
    catalog.close();
  }
}
