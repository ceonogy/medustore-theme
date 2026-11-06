/**
 * Promotion pages (`/khuyen-mai`): the index of live price lists and the
 * per-promotion listing.
 *
 * Keys are owned by this file — add new ones here rather than in `core.ts`.
 *
 * `vi` is the source of truth for keys (Vietnamese-first); `en` mirrors it.
 */
export const vi = {
  "promotions.title": "Khuyến mãi",
  "promotions.metaDescription":
    "Tất cả chương trình khuyến mãi đang diễn ra — giảm giá theo đợt trên các sản phẩm tham gia.",
  "promotions.intro":
    "Các chương trình giảm giá đang diễn ra trong thời gian này.",
  "promotions.empty": "Hiện chưa có chương trình khuyến mãi nào.",
  "promotions.listingIntro":
    "Các sản phẩm tham gia chương trình {{name}} — mức giá đã giảm hiển thị ngay trên từng thẻ sản phẩm.",
  "promotions.startsAt": "Bắt đầu",
  "promotions.endsAt": "Kết thúc",
  "promotions.itemsSingular": "{{count}} sản phẩm",
  "promotions.itemsPlural": "{{count}} sản phẩm",
  "promotions.imageAlt": "Ảnh chương trình {{name}}",

  // countdown (shared by the promotion sections + product detail)
  "promotions.countdown.label": "Kết thúc sau",
  "promotions.countdown.days": "Ngày",
  "promotions.countdown.hours": "Giờ",
  "promotions.countdown.minutes": "Phút",
  "promotions.countdown.seconds": "Giây",
  "promotions.countdown.ended": "Đã kết thúc",
  "promotions.countdown.productNote":
    "Chương trình khuyến mãi đang áp dụng cho sản phẩm này.",
  "promotions.viewProgram": "Xem chương trình",
  "promotions.viewAll": "Xem tất cả {{count}} sản phẩm",
  "promotions.noProducts": "Chương trình chưa có sản phẩm để hiển thị.",
  "promotions.slider.prev": "Sản phẩm trước",
  "promotions.slider.next": "Sản phẩm tiếp theo",
};

export const en = {
  "promotions.title": "Promotions",
  "promotions.metaDescription":
    "All promotions running right now — staged discounts across the participating products.",
  "promotions.intro": "Discount programs running right now.",
  "promotions.empty": "There are no promotions at the moment.",
  "promotions.listingIntro":
    "Products in {{name}} — the reduced price shows right on each product card.",
  "promotions.startsAt": "Starts",
  "promotions.endsAt": "Ends",
  "promotions.itemsSingular": "{{count}} product",
  "promotions.itemsPlural": "{{count}} products",
  "promotions.imageAlt": "Image for {{name}}",

  "promotions.countdown.label": "Ends in",
  "promotions.countdown.days": "Days",
  "promotions.countdown.hours": "Hours",
  "promotions.countdown.minutes": "Minutes",
  "promotions.countdown.seconds": "Seconds",
  "promotions.countdown.ended": "Ended",
  "promotions.countdown.productNote":
    "This promotion is currently applied to this product.",
  "promotions.viewProgram": "View promotion",
  "promotions.viewAll": "View all {{count}} products",
  "promotions.noProducts": "This promotion has no products to show yet.",
  "promotions.slider.prev": "Previous product",
  "promotions.slider.next": "Next product",
};
