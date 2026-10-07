const KNOWN_PRODUCT_TYPES = /^(New Product|Transfer Product|Existing Product|Create new PSF|Revise from old PSF|Product Transfer)\b/

export function productTypeLabel(value: string | null | undefined): string {
  return KNOWN_PRODUCT_TYPES.test(value ?? '') ? value!.replace(/\s*\(.*\)$/, '') : 'รอระบุ Product Type'
}
