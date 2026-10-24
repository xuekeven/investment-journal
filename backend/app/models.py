from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


def to_camel(value: str) -> str:
    parts = value.split("_")
    return parts[0] + "".join(part.capitalize() for part in parts[1:])


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ProductStructure(str, Enum):
    ETF = "ETF"
    OPEN_END_INDEX = "普通开放式指数基金"
    ETF_FEEDER = "ETF联接基金"
    OPEN_END = "普通开放式基金"
    LOF = "LOF"


class TradingVenue(str, Enum):
    ON_EXCHANGE = "场内"
    OFF_EXCHANGE = "场外"


class TrackingMethod(str, Enum):
    PASSIVE = "被动指数"
    ENHANCED = "指数增强"
    ACTIVE = "主动管理"


class DataStatus(str, Enum):
    VERIFIED = "verified"
    DELAYED = "delayed"
    ESTIMATED = "estimated"
    SAMPLE = "sample"
    UNAVAILABLE = "unavailable"


class FundTagType(str, Enum):
    FAVORITE = "favorite"
    HOLDING = "holding"
    RECURRING = "recurring"


class FundBlacklistItem(ApiModel):
    id: int | None = None
    value: str = Field(min_length=1, max_length=200)
    manager_name: str = Field(default="", max_length=200)
    fund_name: str = Field(default="", max_length=200)
    reason: str = Field(default="", max_length=1000)


class FundBlacklist(ApiModel):
    companies: list[FundBlacklistItem] = Field(default_factory=list)
    codes: list[FundBlacklistItem] = Field(default_factory=list)


LimitNotificationScope = Literal[
    "sp-500", "nasdaq-100", "other-qdii", "csi-500", "favorite", "holding", "recurring"
]
LimitNotificationFundType = Literal["on_exchange", "off_exchange", "all"]
DeviationDirection = Literal["above", "below"]


class LimitNotificationConfigUpdate(ApiModel):
    enabled: bool = False
    scope: LimitNotificationScope = "favorite"
    fund_type: LimitNotificationFundType = "off_exchange"
    deviation_enabled: bool = False
    deviation_threshold: Decimal = Field(default=Decimal("0"), max_digits=8, decimal_places=2)
    deviation_direction: DeviationDirection = "above"
    wework_user_id: str = Field(default="XueKai", max_length=256)
    wework_app: str = Field(default="main", min_length=1, max_length=64)


class LimitNotificationConfig(LimitNotificationConfigUpdate):
    relay_configured: bool = False
    last_sent_at: datetime | None = None
    last_error: str | None = None


class LimitNotificationTestRequest(ApiModel):
    scope: LimitNotificationScope
    kind: Literal["deviation", "limit"]
    deviation_threshold: Decimal = Field(default=Decimal("0"), max_digits=8, decimal_places=2)
    deviation_direction: DeviationDirection = "above"
    wework_user_id: str = Field(min_length=1, max_length=256)
    wework_app: str = Field(default="main", min_length=1, max_length=64)


class HealthResponse(ApiModel):
    status: str
    version: str
    data_mode: str
    checked_at: datetime


class IndexSummary(ApiModel):
    id: str
    name: str
    short_name: str
    region: str
    currency: str
    exact_benchmark: str
    fund_count: int = 0
    status: DataStatus = DataStatus.SAMPLE


class MetricValue(ApiModel):
    period: str
    value: float | None = None
    start_date: date | None = None
    end_date: date | None = None
    status: DataStatus = DataStatus.SAMPLE


class FundComparisonRow(ApiModel):
    id: str
    product_id: str
    code: str
    display_name: str
    fund_company: str
    index_id: str
    product_structure: ProductStructure
    trading_venue: TradingVenue
    investment_scope: list[str]
    tracking_method: TrackingMethod
    exact_benchmark: str
    share_class: str | None = None
    currency: str = "人民币"
    subscription_status: str | None = None
    subscription_limit_amount: float | None = None
    subscription_limit_currency: str | None = None
    next_subscription_status: str | None = None
    next_subscription_limit_amount: float | None = None
    next_subscription_limit_currency: str | None = None
    next_subscription_effective_from: datetime | None = None
    exchange: str | None = None
    management_fee: float | None = None
    custody_fee: float | None = None
    sales_service_fee: float | None = None
    expense_rate: float | None = None
    close_price: float | None = None
    close_date: date | None = None
    nav: float | None = None
    nav_date: date | None = None
    estimated_deviation: float | None = None
    scale_billion_cny: float | None = None
    scale_date: date | None = None
    returns: list[MetricValue]
    data_status: DataStatus = DataStatus.SAMPLE
    source_name: str | None = None
    source_url: str | None = None
    source_time: datetime | None = None
    note: str | None = None
    tags: list[FundTagType] = Field(default_factory=list)
    holding_amount: float | None = Field(default=None, ge=0)
    holding_cost: float | None = Field(default=None, ge=0)
    recurring_amount: float | None = Field(default=None, ge=0)


class FundTagState(ApiModel):
    tags: list[FundTagType] = Field(default_factory=list, max_length=3)
    holding_amount: float | None = Field(default=None, ge=0)
    holding_cost: float | None = Field(default=None, ge=0)
    recurring_amount: float | None = Field(default=None, ge=0)


class FundTagUpdate(FundTagState):
    pass


class FundTagResponse(FundTagState):
    fund_code: str


class DataFreshness(ApiModel):
    master: datetime | None = None
    nav: datetime | None = None
    quote: datetime | None = None
    fee: datetime | None = None
    scale: datetime | None = None
    metric: datetime | None = None
    subscription: datetime | None = None

    @property
    def latest_at(self) -> datetime | None:
        values = (
            self.master,
            self.nav,
            self.quote,
            self.fee,
            self.scale,
            self.metric,
            self.subscription,
        )
        return max((value for value in values if value is not None), default=None)


class InvestmentNoteCategory(str, Enum):
    LONG_TERM = "长期"
    REAL_TIME = "实时"


class InvestmentNoteAction(str, Enum):
    ADD = "加仓"
    REDUCE = "减仓"
    CLEAR = "清仓"
    HOLD = "持有"
    WATCH = "观察"


class InvestmentNotePayload(ApiModel):
    note_date: date
    title: str = Field(min_length=1, max_length=200)
    category: InvestmentNoteCategory
    action: InvestmentNoteAction | None = None
    is_pinned: bool = False
    source_name: str | None = Field(default=None, max_length=200)
    source_option_id: int | None = None
    source_url: str | None = None
    source_excerpt: str | None = None
    own_summary: str | None = None
    content_markdown: str = ""
    tags: list[str] = Field(default_factory=list, max_length=20)
    index_ids: list[str] = Field(default_factory=list, max_length=20)
    fund_codes: list[str] = Field(default_factory=list, max_length=100)


class InvestmentNoteCreate(InvestmentNotePayload):
    pass


class InvestmentNoteUpdate(InvestmentNotePayload):
    pass


class InvestmentNoteItem(InvestmentNotePayload):
    id: int
    created_at: datetime
    updated_at: datetime


class KnowledgeSource(ApiModel):
    name: str = Field(min_length=1, max_length=200)
    url: str | None = None


class KnowledgeArticlePayload(ApiModel):
    title: str = Field(min_length=1, max_length=200)
    category: str = Field(min_length=1, max_length=80)
    category_option_id: int | None = None
    content_markdown: str = ""
    tags: list[str] = Field(default_factory=list, max_length=20)
    sources: list[KnowledgeSource] = Field(default_factory=list, max_length=20)


class KnowledgeArticleCreate(KnowledgeArticlePayload):
    pass


class KnowledgeArticleUpdate(KnowledgeArticlePayload):
    pass


class KnowledgeCategoryOrder(ApiModel):
    category: str = Field(min_length=1, max_length=80)
    category_option_id: int | None = None
    article_ids: list[int] = Field(default_factory=list)


class KnowledgeReorderRequest(ApiModel):
    categories: list[KnowledgeCategoryOrder]


class ContentOptionType(str, Enum):
    INVESTMENT_NOTE_SOURCE = "investment_note_source"
    KNOWLEDGE_CATEGORY = "knowledge_category"
    ASSET_PURPOSE = "asset_purpose"
    ASSET_RISK = "asset_risk"
    ASSET_REGION = "asset_region"
    ASSET_CLASS = "asset_class"
    ASSET_CATEGORY = "asset_category"


class ContentOptionItem(ApiModel):
    id: int | None = None
    value: str = Field(min_length=1, max_length=200)
    in_use: bool = False


class ContentOptionList(ApiModel):
    option_type: ContentOptionType
    values: list[str]
    items: list[ContentOptionItem] = Field(default_factory=list)


class ContentOptionUpdate(ApiModel):
    values: list[str] | None = Field(default=None, min_length=1, max_length=50)
    items: list[ContentOptionItem] | None = Field(default=None, min_length=1, max_length=50)

    @model_validator(mode="after")
    def require_values_or_items(self) -> "ContentOptionUpdate":
        if self.values is None and self.items is None:
            raise ValueError("values or items is required")
        return self


class KnowledgeArticleItem(KnowledgeArticlePayload):
    id: int
    category_order: int
    article_order: int
    created_at: datetime
    updated_at: datetime


class AssetPositionConfig(ApiModel):
    id: int | None = None
    name: str = Field(min_length=1, max_length=160)
    asset_class: str = Field(min_length=1, max_length=64)
    asset_class_option_id: int
    purpose: str | None = Field(default=None, max_length=24)
    purpose_option_id: int | None = None
    risk_level: str | None = Field(default=None, max_length=16)
    risk_option_id: int | None = None
    is_investable: bool = True
    sort_order: int = 0


class AssetAccountConfig(ApiModel):
    id: int | None = None
    name: str = Field(min_length=1, max_length=120)
    region: str = Field(min_length=1, max_length=16)
    currency: str = Field(default="人民币", min_length=1, max_length=16)
    asset_category: str = Field(default="基金", min_length=1, max_length=64)
    asset_category_option_id: int
    target_amount: float | None = None
    sort_order: int = 0
    positions: list[AssetPositionConfig] = Field(default_factory=list)


class AssetAllocationTargetPayload(ApiModel):
    risk_level: Literal["低", "中", "高"]
    target_percent: float = Field(ge=0, le=100)
    warning_threshold: float = Field(default=5, ge=0, le=100)


class AssetConfigPayload(ApiModel):
    accounts: list[AssetAccountConfig]
    targets: list[AssetAllocationTargetPayload]


class AssetSnapshotItemPayload(ApiModel):
    position_id: int
    amount: float
    fx_rate: float = Field(default=1, gt=0)
    expected_annual_rate: float | None = None


class AssetSnapshotPayload(ApiModel):
    snapshot_date: date
    note: str | None = Field(default=None, max_length=1000)
    items: list[AssetSnapshotItemPayload]
    targets: list[AssetAllocationTargetPayload]


class AssetDashboardPosition(AssetPositionConfig):
    id: int
    amount: float = 0
    fx_rate: float = 1
    amount_cny: float = 0
    expected_annual_rate: float | None = None


class AssetDashboardAccount(ApiModel):
    id: int
    name: str
    region: str
    currency: str
    asset_category: str
    asset_category_option_id: int
    target_amount: float | None = None
    sort_order: int
    current_amount: float
    positions: list[AssetDashboardPosition]


class AssetSummary(ApiModel):
    net_assets: float
    investable_assets: float
    domestic_assets: float
    overseas_assets: float
    previous_net_change_percent: float | None = None


class AssetAllocationItem(ApiModel):
    risk_level: Literal["低", "中", "高"]
    target_percent: float
    actual_percent: float
    amount: float
    deviation_percent: float
    warning_threshold: float


class AssetHistoryPoint(ApiModel):
    snapshot_id: int
    snapshot_date: date
    net_assets: float
    investable_assets: float


class AssetDashboard(ApiModel):
    snapshot_id: int | None = None
    snapshot_date: date | None = None
    note: str | None = None
    summary: AssetSummary
    allocations: list[AssetAllocationItem]
    history: list[AssetHistoryPoint]
    accounts: list[AssetDashboardAccount]


class FundListResponse(ApiModel):
    index: IndexSummary
    items: list[FundComparisonRow]
    total: int
    last_synced_at: datetime | None = None
    data_freshness: DataFreshness = Field(default_factory=DataFreshness)
    generated_at: datetime
    data_mode: str


class ComparisonResponse(ApiModel):
    items: list[FundComparisonRow]
    generated_at: datetime
    warnings: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class NavPoint(ApiModel):
    date: date
    value: float
    accumulated_value: float | None = None
    status: DataStatus = DataStatus.SAMPLE


class NavSeriesResponse(ApiModel):
    fund_code: str
    items: list[NavPoint]
    source_name: str | None = None
    generated_at: datetime
