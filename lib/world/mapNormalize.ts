
export function normalizeCellOccupancy(cell: any) {
  if (cell.walkable && (!Number.isFinite(cell.maxOccupancy) || cell.maxOccupancy <= 0)) {
    cell.maxOccupancy = 1;
  }
  return cell;
}
