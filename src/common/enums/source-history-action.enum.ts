export enum SourceHistoryAction {
  /** Stock added by hand / purchase from the supplier. */
  RESTOCK = 'RESTOCK',
  /** Stock consumed because a product was produced. */
  PRODUCTION = 'PRODUCTION',
  /** Stock given back because a product was edited down or deleted. */
  RETURN = 'RETURN',
  /** Manual correction (inventory count, spoilage, ...). */
  ADJUSTMENT = 'ADJUSTMENT',
}
