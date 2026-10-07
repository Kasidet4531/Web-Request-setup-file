export function productTypeLabel(value: string | null | undefined): string {
  return ['New Product', 'Transfer Product', 'Existing Product'].includes(value ?? '') ? value! : 'รอระบุ Product Type'
}
