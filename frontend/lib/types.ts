export type DataStatus = "verified" | "delayed" | "estimated" | "sample" | "unavailable";
export type TradingVenue = "场内" | "场外";
export type FundTag = "favorite" | "holding" | "recurring";

export interface IndexSummary {
  id: string;
  name: string;
  shortName: string;
  region: string;
  currency: string;
  exactBenchmark: string;
  fundCount: number;
  status: DataStatus;
}

export interface MetricValue {
  period: string;
  value: number | null;
  startDate: string | null;
  endDate: string | null;
  status: DataStatus;
}

export interface FundComparisonRow {
  id: string;
  productId: string;
  code: string;
  displayName: string;
  fundCompany: string;
  indexId: string;
  productStructure: "ETF" | "普通开放式指数基金" | "ETF联接基金";
  tradingVenue: TradingVenue;
  investmentScope: string[];
  trackingMethod: "被动指数" | "指数增强";
  exactBenchmark: string;
  shareClass: string | null;
  currency: string;
  subscriptionStatus: "open" | "limited" | "suspended" | null;
  subscriptionLimitAmount: number | null;
  subscriptionLimitCurrency: string | null;
  exchange: string | null;
  managementFee: number | null;
  custodyFee: number | null;
  salesServiceFee: number | null;
  expenseRate: number | null;
  closePrice: number | null;
  closeDate: string | null;
  nav: number | null;
  navDate: string | null;
  estimatedDeviation: number | null;
  scaleBillionCny: number | null;
  scaleDate: string | null;
  returns: MetricValue[];
  dataStatus: DataStatus;
  sourceName: string | null;
  sourceUrl: string | null;
  sourceTime: string | null;
  note: string | null;
  tags: FundTag[];
  holdingAmount: number | null;
  recurringAmount: number | null;
}

export interface FundTagState {
  tags: FundTag[];
  holdingAmount: number | null;
  recurringAmount: number | null;
}

export interface FundTagResponse extends FundTagState {
  fundCode: string;
}

export interface DataFreshness {
  master: string | null;
  nav: string | null;
  quote: string | null;
  fee: string | null;
  scale: string | null;
  metric: string | null;
  subscription: string | null;
}

export interface FundListResponse {
  index: IndexSummary;
  items: FundComparisonRow[];
  total: number;
  lastSyncedAt: string | null;
  dataFreshness: DataFreshness;
  generatedAt: string;
  dataMode: string;
}

export interface ComparisonResponse {
  items: FundComparisonRow[];
  generatedAt: string;
  warnings: string[];
  metadata: Record<string, unknown>;
}


export type InvestmentNoteCategory = "长期" | "实时";
export type InvestmentNoteAction = "加仓" | "减仓" | "清仓" | "持有" | "观察";
export type ContentOptionType = "investment_note_source" | "knowledge_category" | "asset_purpose" | "asset_risk" | "asset_region" | "asset_class" | "asset_category";

export interface ContentOptionItem {
  id: number | null;
  value: string;
  inUse?: boolean;
}

export interface ContentOptionResponse {
  optionType: ContentOptionType;
  values: string[];
  items: ContentOptionItem[];
}

export interface InvestmentNotePayload {
  noteDate: string;
  title: string;
  category: InvestmentNoteCategory;
  action: InvestmentNoteAction | null;
  sourceName: string | null;
  sourceOptionId: number | null;
  sourceUrl: string | null;
  sourceExcerpt: string | null;
  ownSummary: string | null;
  contentMarkdown: string;
  tags: string[];
  indexIds: string[];
  fundCodes: string[];
}

export interface InvestmentNote extends InvestmentNotePayload {
  id: number;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeSource {
  name: string;
  url: string | null;
}

export interface KnowledgeArticlePayload {
  title: string;
  category: string;
  categoryOptionId: number | null;
  contentMarkdown: string;
  tags: string[];
  sources: KnowledgeSource[];
}

export interface KnowledgeArticle extends KnowledgeArticlePayload {
  id: number;
  categoryOrder: number;
  articleOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeCategoryOrder {
  category: string;
  categoryOptionId: number | null;
  articleIds: number[];
}

export type AssetRegion = string;
export type AssetPurpose = string;
export type AssetRiskLevel = string;

export interface AssetPositionConfig {
  id: number | null;
  name: string;
  assetClass: string;
  assetClassOptionId: number;
  purpose: AssetPurpose;
  purposeOptionId: number;
  riskLevel: AssetRiskLevel;
  riskOptionId: number;
  isInvestable: boolean;
  sortOrder: number;
}

export interface AssetAccountConfig {
  id: number | null;
  name: string;
  region: AssetRegion;
  currency: string;
  assetCategory: string;
  assetCategoryOptionId: number;
  targetAmount: number | null;
  sortOrder: number;
  positions: AssetPositionConfig[];
}

export interface AssetAllocationTarget {
  riskLevel: "低" | "中" | "高";
  targetPercent: number;
  warningThreshold: number;
}

export interface AssetConfig {
  accounts: AssetAccountConfig[];
  targets: AssetAllocationTarget[];
}

export interface AssetDashboardPosition extends Omit<AssetPositionConfig, "id"> {
  id: number;
  amount: number;
  fxRate: number;
  amountCny: number;
  expectedAnnualRate: number | null;
}

export interface AssetDashboardAccount {
  id: number;
  name: string;
  region: AssetRegion;
  currency: string;
  assetCategory: string;
  assetCategoryOptionId: number;
  targetAmount: number | null;
  sortOrder: number;
  currentAmount: number;
  positions: AssetDashboardPosition[];
}

export interface AssetAllocation {
  riskLevel: "低" | "中" | "高";
  targetPercent: number;
  actualPercent: number;
  amount: number;
  deviationPercent: number;
  warningThreshold: number;
}

export interface AssetHistoryPoint {
  snapshotId: number;
  snapshotDate: string;
  netAssets: number;
  investableAssets: number;
}

export interface AssetDashboard {
  snapshotId: number | null;
  snapshotDate: string | null;
  note: string | null;
  summary: {
    netAssets: number;
    investableAssets: number;
    domesticAssets: number;
    overseasAssets: number;
    previousNetChangePercent: number | null;
  };
  allocations: AssetAllocation[];
  history: AssetHistoryPoint[];
  accounts: AssetDashboardAccount[];
}

export interface AssetSnapshotPayload {
  snapshotDate: string;
  note: string | null;
  targets: AssetAllocationTarget[];
  items: Array<{
    positionId: number;
    amount: number;
    fxRate: number;
    expectedAnnualRate: number | null;
  }>;
}
