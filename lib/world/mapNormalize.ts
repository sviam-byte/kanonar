
export function normalizeCellOccupancy(cell: any) {
  // Defensive: sparse/undefined cells may exist in authored maps
  if (!cell || typeof cell !== 'object') return cell;
  if (cell.walkable && (!Number.isFinite(cell.maxOccupancy) || cell.maxOccupancy <= 0)) {
    cell.maxOccupancy = 1;
  }
  return cell;
}
