/**
 * Shell + static-page copy: layout, navigation, footer, landing, store list,
 * privacy and terms.
 *
 * `vi` is the source of truth for keys (Vietnamese-first); `en` mirrors it.
 */
export const vi = {
  "site.name": "Demo Store",
  "site.description":
    "Cửa hàng demo dựng bằng Astro và Medusa cho hiệu năng tối ưu.",
  "site.brand": "Demo Store",

  "common.unknownError": "Đã xảy ra lỗi không xác định",
  "common.loading": "Đang tải...",
  "common.pageNotFound": "Không tìm thấy trang này",
  "common.backToStore": "Quay lại cửa hàng",
  "common.serviceUnavailable":
    "Một lỗi tạm thời đã xảy ra. Vui lòng thử lại sau.",

  "nav.explore": "Khám phá",
  "nav.megaCollections": "Bộ sưu tập",
  "nav.megaFeatured": "Nổi bật",
  "nav.megaAll": "Tất cả sản phẩm",
  "nav.cart": "Giỏ hàng",
  "nav.cartCount": "Giỏ hàng ({{count}})",
  "nav.cartAria": "Giỏ hàng, {{count}} sản phẩm",
  "nav.openCart": "Mở giỏ hàng",
  "nav.language": "Ngôn ngữ",
  "nav.main": "Điều hướng chính",
  "nav.menu": "Menu",
  "nav.close": "Đóng menu",

  "footer.eyebrow": "Demo Store",
  "footer.headline": "Một cửa hàng sẵn sàng để ra mắt.",
  "footer.description":
    "Được xây dựng cho việc duyệt web nhanh, thanh toán gọn gàng và trải nghiệm mua sắm trọn vẹn từ cú nhấp đầu tiên đến khi đơn hàng được xác nhận.",
  "footer.shop": "Cửa hàng",
  "footer.company": "Công ty",
  "footer.customerCare": "Chăm sóc khách hàng",
  "footer.customerCareText":
    "Cần hỗ trợ? Hãy duyệt danh mục, thử giỏ hàng và trải nghiệm toàn bộ quy trình mua hàng.",
  "footer.navShop": "Điều hướng cửa hàng trong chân trang",
  "footer.navCompany": "Điều hướng công ty trong chân trang",
  "footer.home": "Trang chủ",
  "footer.allProducts": "Tất cả sản phẩm",
  "footer.cart": "Giỏ hàng",
  "footer.checkout": "Thanh toán",
  "footer.privacy": "Chính sách bảo mật",
  "footer.terms": "Điều khoản",
  "footer.startShopping": "Bắt đầu mua sắm",
  "footer.copyright": "© {{year}} Demo Store. Mọi quyền được bảo lưu.",

  "home.eyebrow": "Astro + Medusa",
  "home.title": "Cửa hàng thương mại điện tử mẫu",
  "home.subtitle":
    "Demo Store là cách nhanh nhất để dựng cửa hàng của bạn, với hiệu năng là ưu tiên hàng đầu.",
  "home.browseProducts": "Xem sản phẩm",
  "home.imageAlt": "Sản phẩm nổi bật",
  "home.heroTitle": "MẶC ĐƠN GIẢN.\nCHẤT RIÊNG.",
  "home.heroEyebrow": "NEW COLLECTION / 2026",
  "home.heroSub": "Thiết kế tối giản. Form dáng hiện đại. Chất riêng mỗi ngày.",
  "home.heroCta": "KHÁM PHÁ NGAY",
  "home.heroCtaSecondary": "XEM BỘ SƯU TẬP",
  "home.heroImageLabel": "EVERYDAY UNIFORM",
  "home.heroImageIndex": "01 / ESSENTIALS",
  "home.heroImageAlt": "Người mẫu mặc áo thun trắng phom rộng phối quần màu be",
  "home.lookEyebrow": "SHOP THE LOOK",
  "home.lookTitle": "Bốn món cơ bản, một set hoàn chỉnh.",
  "home.lookSub":
    "Sơ mi kẻ sọc, quần wash vừa, đồng hồ dây kim loại và giày lười retro — tất cả đều có sẵn trong cửa hàng. Chạm vào từng điểm trên ảnh để xem giá và chi tiết sản phẩm.",
  "home.lookImageAlt":
    "Người mẫu mặc áo sơ mi kẻ sọc xanh, quần kaki sáng và giày lười retro",
  "home.newArrivalsEyebrow": "Mặc như một pro",
  "home.newArrivalsTitle": "Hàng mới về",
  "home.newArrivalsSub":
    "Khám phá những phong cách mới nhất: luôn dẫn đầu xu hướng với các mẫu vừa về shop.",
  "home.viewProduct": "Xem sản phẩm",
  "home.quote":
    "Tôi thích sự đa dạng về phong cách và chất lượng quần áo trên trang thời trang này.",
  "home.quoteAuthor": "— Khách hàng Demo",
  "home.collectionsEyebrow": "Bộ sưu tập của chúng tôi",
  "home.collectionsSub":
    "Để mình được truyền cảm hứng, từ một phong cách độc đáo đến phong cách khác.",
  "home.collectionWomen": "Bộ sưu tập nữ",
  "home.collectionMan": "Bộ sưu tập nam",
  "home.collectionBags": "Túi xách",
  "home.collectionImageAlt": "Ảnh đại diện bộ sưu tập {{name}}",
  "home.feature1Title": "Miễn phí vận chuyển",
  "home.feature1Sub": "Cho đơn hàng từ 500.000 ₫",
  "home.feature2Title": "Hoàn tiền",
  "home.feature2Sub": "Cam kết trong 30 ngày",
  "home.feature3Title": "Hỗ trợ cao cấp",
  "home.feature3Sub": "Hỗ trợ qua điện thoại và email",
  "home.feature4Title": "Thanh toán an toàn",
  "home.feature4Sub": "Được bảo mật bởi Stripe",
  "home.newsletterTitle": "Nhận bản tin của chúng tôi",
  "home.newsletterSub": "Đăng ký để nhận tin về bộ sưu tập và ưu đãi sắp tới.",
  "home.newsletterEmailLabel": "Địa chỉ email",
  "home.newsletterPlaceholder": "Email của bạn",
  "home.newsletterSubmit": "Đăng ký",
  "home.newsletterSuccess": "Cảm ơn bạn đã đăng ký!",

  "store.title": "Tất cả sản phẩm",
  "store.description":
    "Xem toàn bộ bộ sưu tập sản phẩm. Khám phá ưu đãi tốt nhất và các mặt hàng mới nhất.",
  "store.productsLabel": "Danh sách sản phẩm",

  "product.metaDescription": "Mua {{title}} với giá tốt nhất.",
  "product.imageAlt": "Ảnh sản phẩm",

  "privacy.title": "Chính sách bảo mật",
  "privacy.description":
    "Tìm hiểu cách Demo Store xử lý dữ liệu khách hàng và thanh toán.",
  "privacy.eyebrow": "Chính sách bảo mật",
  "privacy.heading": "Nền tảng cửa hàng ưu tiên quyền riêng tư",
  "privacy.p1":
    "Cửa hàng này được thiết kế để việc xử lý dữ liệu khách hàng luôn rõ ràng. Thông tin thanh toán và giỏ hàng chỉ được thu thập khi cần để hoàn tất một đơn hàng.",
  "privacy.p2":
    "Chi tiết thanh toán được xử lý qua các nhà cung cấp thanh toán đã kết nối chứ không được lưu trực tiếp trong mã nguồn cửa hàng. Khu vực và trạng thái giỏ hàng được dùng để giữ giá và quy trình thanh toán luôn chính xác với người mua.",
  "privacy.p3":
    "Nếu bạn đưa cửa hàng này vào sản xuất, hãy thay trang này bằng chính sách doanh nghiệp, thời hạn lưu giữ và thông tin liên hệ của riêng bạn trước khi vận hành thật.",

  "terms.title": "Điều khoản",
  "terms.description": "Điều khoản cơ bản cho trải nghiệm Demo Store.",
  "terms.eyebrow": "Điều khoản",
  "terms.heading": "Điều khoản đơn giản cho cửa hàng sẵn sàng demo",
  "terms.p1":
    "Cửa hàng này là một dự án demo dùng để khám phá, thử nghiệm và tùy biến. Sản phẩm, giá cả và quy trình thanh toán phụ thuộc vào cấu hình backend Medusa đã kết nối.",
  "terms.p2":
    "Các đơn hàng đặt trong môi trường demo nên được coi là đơn hàng thử, trừ khi bạn đã kết nối các dịch vụ thanh toán, vận chuyển và hoàn thiện đơn hàng thật.",
  "terms.p3":
    "Trước khi công bố chính thức, hãy thay trang này bằng điều khoản thương mại, quy định vận chuyển, chính sách đổi trả và thông tin hỗ trợ của riêng bạn.",

  "cart.pageTitle": "Giỏ hàng",
  "cart.pageDescription": "Kiểm tra các mặt hàng trong giỏ hàng của bạn.",

  "checkout.pageTitle": "Thanh toán",
  "checkout.pageDescription": "Hoàn tất đơn hàng của bạn.",

  "order.pageTitle": "Đơn hàng đã xác nhận",
  "order.pageDescription": "Đơn hàng của bạn đã được xác nhận.",
};

export const en: typeof vi = {
  "site.name": "Demo Store",
  "site.description":
    "Demo store built with Astro and Medusa for maximum performance.",
  "site.brand": "Demo Store",

  "common.unknownError": "Unknown error",
  "common.loading": "Loading...",
  "common.pageNotFound": "Page not found",
  "common.backToStore": "Back to the store",
  "common.serviceUnavailable":
    "Something went wrong temporarily. Please try again shortly.",

  "nav.explore": "Explore",
  "nav.megaCollections": "Collections",
  "nav.megaFeatured": "Featured",
  "nav.megaAll": "All products",
  "nav.cart": "Cart",
  "nav.cartCount": "Cart ({{count}})",
  "nav.cartAria": "Shopping cart with {{count}} item",
  "nav.openCart": "Open cart",
  "nav.language": "Language",
  "nav.main": "Main navigation",
  "nav.menu": "Menu",
  "nav.close": "Close menu",

  "footer.eyebrow": "Demo Store",
  "footer.headline": "A storefront that feels ready to ship.",
  "footer.description":
    "Built for fast browsing, clean checkout, and a polished shopping flow from first click to confirmed order.",
  "footer.shop": "Shop",
  "footer.company": "Company",
  "footer.customerCare": "Customer Care",
  "footer.customerCareText":
    "Need help? Browse the catalog, test the cart, and explore the full purchase flow end to end.",
  "footer.navShop": "Footer shop navigation",
  "footer.navCompany": "Footer company navigation",
  "footer.home": "Home",
  "footer.allProducts": "All products",
  "footer.cart": "Cart",
  "footer.checkout": "Checkout",
  "footer.privacy": "Privacy",
  "footer.terms": "Terms",
  "footer.startShopping": "Start shopping",
  "footer.copyright": "© {{year}} Demo Store. All rights reserved.",

  "home.eyebrow": "Astro + Medusa",
  "home.title": "e-commerce demo store",
  "home.subtitle":
    "Demo Store is a good way to start building your e-commerce store, with maximum performance in mind.",
  "home.browseProducts": "Browse products",
  "home.imageAlt": "Featured product",
  "home.heroTitle": "WEAR SIMPLE.\nOWN YOUR STYLE.",
  "home.heroEyebrow": "NEW COLLECTION / 2026",
  "home.heroSub": "Minimal design. Modern fit. Your style, every day.",
  "home.heroCta": "EXPLORE NOW",
  "home.heroCtaSecondary": "VIEW COLLECTION",
  "home.heroImageLabel": "EVERYDAY UNIFORM",
  "home.heroImageIndex": "01 / ESSENTIALS",
  "home.heroImageAlt":
    "Model wearing an oversized white tee with beige trousers",
  "home.lookEyebrow": "SHOP THE LOOK",
  "home.lookTitle": "Four basics, one complete set.",
  "home.lookSub":
    "Plaid shirt, mid-wash jeans, classic metal watch and retro sneakers — every piece of this look is in stock. Tap a point on the image for price and details.",
  "home.lookImageAlt":
    "Model wearing a blue plaid shirt, light chinos and retro sneakers",
  "home.newArrivalsEyebrow": "Wear like a Pro",
  "home.newArrivalsTitle": "New Arrivals",
  "home.newArrivalsSub":
    "Shop the latest styles: stay ahead of the curve with our newest arrivals",
  "home.viewProduct": "View product",
  "home.quote":
    "I love the variety of styles and the high-quality clothing on this web fashion site.",
  "home.quoteAuthor": "— Some & Co",
  "home.collectionsEyebrow": "Our collections",
  "home.collectionsSub":
    "Inspire and let yourself be inspired, from one unique fashion to another.",
  "home.collectionWomen": "Women collection",
  "home.collectionMan": "Men collection",
  "home.collectionBags": "Bags",
  "home.collectionImageAlt": "{{name}} collection cover",
  "home.feature1Title": "Free shipping",
  "home.feature1Sub": "Orders above 500.000 ₫",
  "home.feature2Title": "Money-back",
  "home.feature2Sub": "30 day guarantee",
  "home.feature3Title": "Premium support",
  "home.feature3Sub": "Phone and email support",
  "home.feature4Title": "Secure payments",
  "home.feature4Sub": "Secured by Stripe",
  "home.newsletterTitle": "Get our newsletter",
  "home.newsletterSub":
    "Sign up for updates on upcoming collections and offers.",
  "home.newsletterEmailLabel": "Email address",
  "home.newsletterPlaceholder": "Your email",
  "home.newsletterSubmit": "Subscribe",
  "home.newsletterSuccess": "Thanks for subscribing!",

  "store.title": "All Products",
  "store.description":
    "Browse our full collection of products. Find the best deals and latest arrivals.",
  "store.productsLabel": "Product list",

  "product.metaDescription": "Shop {{title} at the best price.",
  "product.imageAlt": "Product image",

  "privacy.title": "Privacy",
  "privacy.description":
    "Learn how Demo Store handles customer and checkout data.",
  "privacy.eyebrow": "Privacy",
  "privacy.heading": "Privacy-first storefront foundations",
  "privacy.p1":
    "This store is designed to keep customer data handling straightforward. Checkout and cart information is only collected when needed to complete an order flow.",
  "privacy.p2":
    "Payment details are processed through connected payment providers rather than stored directly in the storefront codebase. Region and cart state are used to keep pricing and checkout behavior accurate for the shopper.",
  "privacy.p3":
    "If you adapt this store for production, update this page with your own business policies, retention periods, and contact details before going live.",

  "terms.title": "Terms",
  "terms.description": "Basic storefront terms for the Demo Store experience.",
  "terms.eyebrow": "Terms",
  "terms.heading": "Simple terms for a demo-ready storefront",
  "terms.p1":
    "This storefront is a demo project meant for exploration, testing, and customization. Product, pricing, and checkout behavior depend on the connected Medusa backend configuration.",
  "terms.p2":
    "Orders placed in a demo environment should be treated as test orders unless you have connected live payment, shipping, and fulfillment services.",
  "terms.p3":
    "Before launching publicly, replace this page with your own commercial terms, shipping rules, returns policy, and support information.",

  "cart.pageTitle": "Cart",
  "cart.pageDescription": "Review the items in your shopping cart.",

  "checkout.pageTitle": "Checkout",
  "checkout.pageDescription": "Complete your purchase.",

  "order.pageTitle": "Order Confirmed",
  "order.pageDescription": "Your order has been confirmed.",
};
