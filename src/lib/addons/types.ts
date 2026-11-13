import type { ComponentType, ReactNode } from "react";

/**
 * Structural contracts for optional addons.
 *
 * The theme never imports addon internals — it only talks to these interfaces,
 * so `enabled.ts` can be emptied (or an addon uninstalled) without breaking
 * the build.
 */

export interface GoshipAddressValue {
  province: string;
  district: string;
  ward: string;
  provinceCode: string;
  districtCode: string;
  wardCode: string;
}

export interface GoshipSelectProps {
  testId: string;
  value: string;
  placeholder: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  invalid?: boolean;
  onChange: (value: string) => void;
}

export interface GoshipAddressFieldsProps {
  value: GoshipAddressValue;
  onChange: (patch: Partial<GoshipAddressValue>) => void;
  baseUrl?: string;
  publishableKey?: string;
  labels?: {
    province?: string;
    district?: string;
    ward?: string;
    loading?: string;
    fallbackHint?: string;
  };
  classNames?: {
    group?: string;
    select?: string;
    input?: string;
    hint?: string;
  };
  disabled?: boolean;
  testIdPrefix?: string;
  renderSelect?: (props: GoshipSelectProps) => ReactNode;
}

export interface GoshipAddon {
  AddressFields: ComponentType<GoshipAddressFieldsProps>;
  getUnits(options?: {
    baseUrl?: string;
    publishableKey?: string;
  }): Promise<{ weightUnit: "g" | "kg"; dimensionUnit: "cm" | "m" }>;
}

export interface SepayLabels {
  title?: string;
  instruction?: string;
  qrAlt?: string;
  bankLabel?: string;
  vaLabel?: string;
  holderLabel?: string;
  amountLabel?: string;
  contentLabel?: string;
  copy?: string;
  copied?: string;
  expires?: (time: string) => string;
  waiting?: string;
  expired?: string;
  regenerate?: string;
  regenerating?: string;
  regenerated?: string;
  regenerateFailed?: string;
  paid?: string;
  loadFailed?: string;
}

export interface SepayPaymentPanelProps {
  orderId: string | null;
  baseUrl?: string;
  publishableKey?: string;
  labels?: SepayLabels;
  formatAmount?: (amount: number, currencyCode: string) => string;
  pollIntervalMs?: number;
  showLoadError?: boolean;
}

export interface SepayAddon {
  PaymentPanel: ComponentType<SepayPaymentPanelProps>;
}

export interface AddonRegistry {
  goship?: GoshipAddon;
  sepay?: SepayAddon;
}

export interface AddonClientConfig {
  baseUrl: string;
  publishableKey: string;
}
