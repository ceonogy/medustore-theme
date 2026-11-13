import { localizePath, useTranslations, type Locale } from "@i18n";
import { logout } from "@lib/auth";
import type { ReactNode } from "react";

interface AccountShellProps {
  locale: Locale;
  /** Page label — rendered flush-left at the wrap edge, like checkout. */
  heading: ReactNode;
  /** Which menu entry is current — highlighted with aria-current. */
  active: "account" | "orders";
  children: ReactNode;
}

/**
 * Customer CP frame: label + content on the left, action menu
 * (Đơn hàng · Tài khoản · Đăng xuất) on the right — both inside the same
 * `.wrap` as the header so total width aligns. On phones the menu stacks
 * above the content as a horizontal row.
 */
export const AccountShell = ({
  locale,
  heading,
  active,
  children,
}: AccountShellProps) => {
  const t = useTranslations(locale);

  const items = [
    {
      key: "orders" as const,
      href: localizePath(locale, "/tai-khoan/don-hang"),
      label: t("account.orders.title"),
    },
    {
      key: "account" as const,
      href: localizePath(locale, "/tai-khoan"),
      label: t("account.dashboard.title"),
    },
  ];

  const onLogout = async () => {
    await logout();
    window.location.assign("/");
  };

  const itemClass = (isActive: boolean) =>
    `block py-2.5 text-sm transition-colors ${
      isActive ? "font-bold text-ink" : "text-ink/60 hover:text-ink"
    }`;

  return (
    <section className="wrap py-16 wide:py-24">
      <div className="grid gap-8 tablet:grid-cols-[minmax(0,1fr)_220px] tablet:gap-12">
        <aside className="self-start border-b border-line pb-2 tablet:order-none tablet:sticky tablet:top-28 tablet:border-b-0 tablet:border-t tablet:pb-0 tablet:pt-2">
          <nav
            aria-label={t("account.dashboard.title")}
            className="flex flex-wrap gap-x-6 tablet:flex-col tablet:gap-0"
          >
            {items.map((item) => (
              <a
                key={item.key}
                href={item.href}
                aria-current={active === item.key ? "page" : undefined}
                className={itemClass(active === item.key)}
              >
                {item.label}
              </a>
            ))}
            <button
              type="button"
              onClick={onLogout}
              className={`${itemClass(false)} cursor-pointer text-left hover:text-sale`}
            >
              {t("account.logout")}
            </button>
          </nav>
        </aside>

        <div className="min-w-0 tablet:order-first">
          {/* type-title is a centred section heading by design — the CP
              pages want theirs flush-left like checkout. */}
          <h1 className="type-title text-left">{heading}</h1>
          {children}
        </div>
      </div>
    </section>
  );
};
