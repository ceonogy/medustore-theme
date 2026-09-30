/**
 * Product surfaces copy: listing card, product details, attributes, filters.
 *
 * Keys are owned by this file — add new ones here rather than in `core.ts`.
 *
 * `vi` is the source of truth for keys (Vietnamese-first); `en` mirrors it.
 */
export const vi = {
  // product-details → ProductActions
  "products.actions.addToCart": "Thêm vào giỏ",
  "products.actions.adding": "Đang thêm...",

  // product-details → ProductAttributes
  "products.attributes.material": "Chất liệu",
  "products.attributes.countryOfOrigin": "Xuất xứ",
  "products.attributes.type": "Loại",
  "products.attributes.weight": "Khối lượng",
  "products.attributes.dimensions": "Kích thước",

  // product-preview → Price (screen-reader labels next to the raw amounts)
  "products.price.original": "Giá gốc",
  "products.price.current": "Giá bán",

  // thumbnail placeholder
  "products.thumbnail.imageAlt": "Ảnh sản phẩm",

  // product-filters → ProductFilters
  "products.filters.title": "Bộ lọc",
  "products.filters.resultSingular": "{{count}} sản phẩm",
  "products.filters.resultPlural": "{{count}} sản phẩm",
  "products.filters.category": "Danh mục",
  "products.filters.collection": "Bộ sưu tập",
  "products.filters.removeFilter": "Xóa bộ lọc {{label}}",
  "products.filters.clearAll": "Xóa tất cả",
  "products.filters.clearAllFilters": "Xóa tất cả bộ lọc",
  "products.filters.noResults":
    "Không có sản phẩm nào khớp với bộ lọc đã chọn.",
  "products.filters.noResultsHint": "để xem toàn bộ sản phẩm.",
};

export const en: typeof vi = {
  // product-details → ProductActions
  "products.actions.addToCart": "Add to Cart",
  "products.actions.adding": "Adding...",

  // product-details → ProductAttributes
  "products.attributes.material": "Material",
  "products.attributes.countryOfOrigin": "Country of origin",
  "products.attributes.type": "Type",
  "products.attributes.weight": "Weight",
  "products.attributes.dimensions": "Dimensions",

  // product-preview → Price (screen-reader labels next to the raw amounts)
  "products.price.original": "Original price",
  "products.price.current": "Price",

  // thumbnail placeholder
  "products.thumbnail.imageAlt": "Product image",

  // product-filters → ProductFilters
  "products.filters.title": "Filters",
  "products.filters.resultSingular": "{{count}} product",
  "products.filters.resultPlural": "{{count}} products",
  "products.filters.category": "Category",
  "products.filters.collection": "Collection",
  "products.filters.removeFilter": "Remove filter {{label}}",
  "products.filters.clearAll": "Clear all",
  "products.filters.clearAllFilters": "Clear all filters",
  "products.filters.noResults": "No products match the selected filters.",
  "products.filters.noResultsHint": "to see the full collection.",
};
