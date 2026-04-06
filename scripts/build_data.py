#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
from datetime import datetime
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd


def norm_article(x):
    if pd.isna(x):
        return None
    return str(x).strip().strip("'").strip('"').strip().lower()


def first_nonnull(series: Iterable):
    for v in series:
        if pd.notna(v) and str(v).strip() != "":
            return v
    return None


def truthy_flag(v):
    if pd.isna(v):
        return None
    if isinstance(v, (bool, np.bool_)):
        return bool(v)
    if isinstance(v, (int, float, np.integer, np.floating)) and not isinstance(v, bool):
        if math.isnan(float(v)):
            return None
        return float(v) != 0
    s = str(v).strip().lower().replace("ё", "е")
    if s in {"", "nan", "none", "null", "—", "-"}:
        return None
    if s in {"1", "true", "yes", "y", "да", "есть", "active", "активно"}:
        return True
    if s in {"0", "false", "no", "n", "нет"}:
        return False
    return True


def clean_val(v):
    if pd.isna(v):
        return None
    if isinstance(v, (np.floating, float)):
        if math.isfinite(v):
            return round(float(v), 4)
        return None
    if isinstance(v, (np.integer, int)):
        return int(v)
    if isinstance(v, pd.Timestamp):
        return v.isoformat()
    if isinstance(v, datetime):
        return v.isoformat()
    return v


def rows_to_records(df, columns=None):
    if columns is not None:
        df = df[columns]
    return [{k: clean_val(v) for k, v in row.items()} for row in df.to_dict(orient="records")]


def read_semicolon_csv(path: Path) -> pd.DataFrame:
    return pd.read_csv(path, sep=";", encoding="utf-8-sig", engine="python")


def pick_first_existing(src: Path, names: list[str]) -> Path | None:
    for name in names:
        path = src / name
        if path.exists():
            return path
    return None


PREFERRED_OWNER_COLS = ["Ответственный", "Ответственный за товар", "Owner", "Сотрудник"]
PREFERRED_STATUS_COLS = ["Статус товара", "Актуальность товара", "Статус"]
PREFERRED_SKU_COLS = ["SKU", "Артикул", "Наш артикул"]


def find_col(columns: list[str], candidates: list[str]) -> str | None:
    normalized = {str(c).strip().lower().replace("ё", "е"): c for c in columns}
    for cand in candidates:
        key = cand.strip().lower().replace("ё", "е")
        if key in normalized:
            return normalized[key]
    return None


def load_assignment_source(path: Path, source_label: str, priority: int) -> pd.DataFrame:
    frames = []
    try:
        xl = pd.ExcelFile(path)
        preferred = []
        for sheet_name in xl.sheet_names:
            normalized = str(sheet_name).strip().lower().replace("ё", "е")
            if "реестр" in normalized or normalized in {"реестр", "ответсвенные", "ответственные"}:
                preferred.append(sheet_name)
        if not preferred:
            preferred = xl.sheet_names[:3]
        sheets = pd.read_excel(path, sheet_name=preferred, header=2)
    except Exception:
        return pd.DataFrame(columns=[
            "article_key", "owner", "owner_source", "owner_priority", "registry_status",
            "registry_has_kz", "registry_has_vk"
        ])
    for sheet_name, df in sheets.items():
        if df is None or df.empty:
            continue
        df = df.dropna(how="all").copy()
        df.columns = [str(c).strip() for c in df.columns]
        sku_col = find_col(list(df.columns), PREFERRED_SKU_COLS)
        owner_col = find_col(list(df.columns), PREFERRED_OWNER_COLS)
        if not sku_col:
            continue
        status_col = find_col(list(df.columns), PREFERRED_STATUS_COLS)
        kz_col = find_col(list(df.columns), ["Есть в КЗ"])
        vk_col = find_col(list(df.columns), ["Есть в ВК"])
        tmp = pd.DataFrame({
            "article_key": df[sku_col].map(norm_article),
            "owner": df[owner_col] if owner_col else None,
            "registry_status": df[status_col] if status_col else None,
            "registry_has_kz": df[kz_col].map(truthy_flag) if kz_col else None,
            "registry_has_vk": df[vk_col].map(truthy_flag) if vk_col else None,
        })
        tmp = tmp.dropna(subset=["article_key"]).copy()
        if tmp.empty:
            continue
        tmp["owner"] = tmp["owner"].map(lambda x: None if pd.isna(x) or str(x).strip() == "" else str(x).strip())
        tmp["registry_status"] = tmp["registry_status"].map(lambda x: None if pd.isna(x) or str(x).strip() == "" else str(x).strip())
        tmp["owner_source"] = f"{source_label} · {sheet_name}"
        tmp["owner_priority"] = priority
        frames.append(tmp)
    if not frames:
        return pd.DataFrame(columns=[
            "article_key", "owner", "owner_source", "owner_priority", "registry_status",
            "registry_has_kz", "registry_has_vk"
        ])
    return pd.concat(frames, ignore_index=True)


def choose_bool(row, cols: list[str]) -> bool:
    for col in cols:
        if col not in row.index:
            continue
        val = row[col]
        if pd.isna(val):
            continue
        return bool(val)
    return False


MEETING_RHYTHM = [
    {"id": "weekly-mp", "title": "Weekly: операционная планёрка МП", "cadence": "Еженедельно · понедельник", "duration": "60–90 мин",
     "question": "Что делаем по конверсиям, продвижению, рейтингам и запасам на этой неделе?",
     "participants": ["Команда МП WB/Ozon", "Маркетинг", "Внешний трафик"],
     "outputs": ["Список задач на неделю с owner", "Решения по ставкам РК", "Карточки на правку", "Сигналы по запасам", "Решения по акциям и ценам"]},
    {"id": "weekly-fin", "title": "Weekly: финансовая операционная", "cadence": "Еженедельно · четверг", "duration": "30–45 мин",
     "question": "Где мы по ДРР, бюджету РК и недельному план/факту?",
     "participants": ["Финансы/аналитика", "Команда МП", "Маркетинг/трафик"],
     "outputs": ["Недельный отчёт план/факт", "Решения по перераспределению бюджета", "SKU с проблемным ДРР", "Подтверждённый план на следующую неделю"]},
    {"id": "monthly-demand", "title": "Monthly: Demand + логистика + supply", "cadence": "Ежемесячно · 1-я неделя", "duration": "120–150 мин",
     "question": "Каков единый план продаж, хватит ли товара, поставок и производства?",
     "participants": ["Бренд-лид", "МП", "Маркетинг", "Контент-завод", "B2B/KAM", "Финансы", "Операции/закупка"],
     "outputs": ["Единый план продаж", "Прогноз спроса 1–3 месяца", "SKU в зоне риска OOS", "Календарь поставок", "План закупок сырья и упаковки"]},
    {"id": "monthly-fin", "title": "Monthly: финансовая стратегическая", "cadence": "Ежемесячно · 2-я неделя", "duration": "60–90 мин",
     "question": "Где мы по марже, P&L, РРЦ/min price и бюджету следующего месяца?",
     "participants": ["Финансы/аналитика", "Владельцы брендов", "CEO — по повестке"],
     "outputs": ["Финотчёт по брендам", "Решения по min price и РРЦ", "Бюджет следующего месяца", "Список финансовых исключений"]},
    {"id": "monthly-mktg", "title": "Monthly: Marketing Review", "cadence": "Ежемесячно · 2-я или 3-я неделя", "duration": "60–90 мин",
     "question": "Какие товары в фокусе месяца и как распределяем КЗ / таргет / инфлюенсеров?",
     "participants": ["Бренд-директора", "Маркетинг", "Команда МП", "Контент-завод"],
     "outputs": ["Фокусные товары месяца", "Маркетинговый календарь", "Бюджет по инструментам и SKU", "Контент-план с owner"]},
    {"id": "pmr", "title": "PMR: Product Management Review", "cadence": "Квартально + mini PMR ежемесячно", "duration": "120–150 мин / 45–60 мин",
     "question": "Что запускаем, что выводим, какие правила по новинкам, матрице и unit-экономике?",
     "participants": ["CEO", "Бренд-директора", "Продукт", "Маркетинг", "Операции", "Финансы"],
     "outputs": ["Статусы матрицы core/growth/new/exit", "Калькуляторы и РРЦ/МРЦ", "Решения по запуску/выводу SKU", "Календарь новинок"]},
]


def main():
    parser = argparse.ArgumentParser(description="Build JSON data for Brand Portal MVP")
    parser.add_argument("--source-dir", required=True, help="Folder with source xlsx/csv files")
    parser.add_argument("--output-dir", required=True, help="Folder to write JSON data into")
    parser.add_argument("--brand-filter", default="Алтея", help="Brand name to keep in final JSON (default: Алтея)")
    args = parser.parse_args()

    src = Path(args.source_dir)
    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)

    required_files = {
        "products": "products (8).csv",
        "repricer": "Репрайсер шаблон от 27.03.xlsx",
        "plan": "План продаж (2).xlsx",
        "leaderboard": "Продуктовый_лидерборд Март - Апрель 09.03.2026 - 05.04.2026.xlsx",
        "orders": "orders (40).csv",
        "stocks": "stocks_report (6).xlsx",
        "ret_smart": "Возвраты FBS и FBO _ 01 01 - 18 03 _ Смарт.xlsx",
        "ret_big": "Возвраты FBS и FBO _ 01 01 - 18 03 _ Биг-Л.xlsx",
        "launches": "Планирование новинок Алтея (1).xlsx",
    }
    optional_paths = {
        "owner_anna": pick_first_existing(src, ["Для Анны (2).xlsx"]),
        "owner_specs": pick_first_existing(src, ["Рабочий _ Спецификации v2.xlsx", "Рабочий _ Спецификации v2 (1).xlsx"]),
    }

    for key, filename in required_files.items():
        path = src / filename
        if not path.exists():
            raise FileNotFoundError(f"Missing required file: {path}")

    products = read_semicolon_csv(src / required_files["products"])
    products.columns = [c.strip() for c in products.columns]
    products["article_key"] = products["Артикул"].map(norm_article)
    products["Рейтинг"] = pd.to_numeric(products["Рейтинг"].astype(str).str.replace("'", "", regex=False), errors="coerce")
    products["Отзывы"] = pd.to_numeric(products["Отзывы"], errors="coerce")

    repricer = pd.read_excel(src / required_files["repricer"], sheet_name="Репрайсер", header=3)
    repricer = repricer.dropna(how="all")
    repricer.columns = [str(c).strip() for c in repricer.columns]
    repricer["article_key"] = repricer["Артикул"].map(norm_article)

    plan = pd.read_excel(src / required_files["plan"], sheet_name="План", header=0)
    plan.columns = [str(c).strip() for c in plan.columns]
    plan["article_key"] = plan["Артикул"].map(norm_article)

    fact_raw = pd.read_excel(src / required_files["plan"], sheet_name="Факт", header=[0, 1])
    fact = fact_raw.copy()
    fact.columns = [f"{a}|{b}" for a, b in fact.columns]
    fact["article_key"] = fact["MonthYear|Нашартикул"].map(norm_article)

    lb1 = pd.read_excel(src / required_files["leaderboard"], sheet_name="09.03.2026 - 15.03.2026")
    lb2 = pd.read_excel(src / required_files["leaderboard"], sheet_name="16.03.2026 - 22.03.2026")
    leader = pd.concat([lb1.assign(period="09.03-15.03"), lb2.assign(period="16.03-22.03")], ignore_index=True)
    leader.columns = [str(c).strip() for c in leader.columns]
    leader["article_key"] = leader["Буквенный артикул"].map(norm_article)

    orders = read_semicolon_csv(src / required_files["orders"])
    orders.columns = [c.strip() for c in orders.columns]
    orders["article_key"] = orders["Артикул"].map(norm_article)

    stocks_raw = pd.read_excel(src / required_files["stocks"], sheet_name="Товар-склад", header=None)
    header1 = stocks_raw.iloc[0].tolist()
    header2 = stocks_raw.iloc[1].tolist()
    stock_cols = []
    for a, b in zip(header1, header2):
        a = str(a).strip() if pd.notna(a) else ""
        b = str(b).strip() if pd.notna(b) else ""
        stock_cols.append(f"{a}|{b}" if b else a)
    stocks = stocks_raw.iloc[4:].copy()
    stocks.columns = stock_cols
    stocks = stocks.dropna(how="all")
    stocks["article_key"] = stocks["Артикул"].map(norm_article)

    ret_smart = pd.read_excel(src / required_files["ret_smart"], sheet_name="Возвраты", header=5)
    ret_big = pd.read_excel(src / required_files["ret_big"], sheet_name="Возвраты", header=5)
    returns = pd.concat([ret_smart, ret_big], ignore_index=True)
    returns.columns = [str(c).strip() for c in returns.columns]
    returns["article_key"] = returns["Артикул товара"].map(norm_article)
    returns["Количество возвращаемых товаров"] = pd.to_numeric(returns["Количество возвращаемых товаров"], errors="coerce").fillna(0)
    returns["Стоимость товара"] = pd.to_numeric(returns["Стоимость товара"], errors="coerce").fillna(0)

    launches = pd.read_excel(src / required_files["launches"], sheet_name="Календарь новинок Алтея", header=8)
    launches.columns = [str(c).strip() for c in launches.columns]
    launches = launches.dropna(subset=["Название"], how="all").copy()

    assignment_frames = []
    if optional_paths["owner_anna"]:
        assignment_frames.append(load_assignment_source(optional_paths["owner_anna"], "Для Анны", 0))
    if optional_paths["owner_specs"]:
        assignment_frames.append(load_assignment_source(optional_paths["owner_specs"], "Рабочий спецификации", 1))
    assignments = pd.concat(assignment_frames, ignore_index=True) if assignment_frames else pd.DataFrame(columns=[
        "article_key", "owner", "owner_source", "owner_priority", "registry_status", "registry_has_kz", "registry_has_vk"
    ])

    prod_agg = products.groupby("article_key").agg({
        "Название товара": first_nonnull,
        "Бренд": first_nonnull,
        "Категория": first_nonnull,
        "Тип": first_nonnull,
        "Отзывы": "max",
        "Рейтинг": first_nonnull,
        "Доступно к продаже по схеме FBO, шт.": "sum",
        "Текущая цена с учетом скидки, ₽": "max",
    }).reset_index().rename(columns={
        "Название товара": "product_name",
        "Бренд": "brand_products",
        "Категория": "category",
        "Тип": "type",
        "Отзывы": "reviews",
        "Рейтинг": "rating",
        "Доступно к продаже по схеме FBO, шт.": "ozon_fbo_stock_products",
        "Текущая цена с учетом скидки, ₽": "ozon_price_products",
    })

    repr_agg = repricer.groupby("article_key").agg({
        "Артикул": first_nonnull,
        "Направление": first_nonnull,
        "Бренд": first_nonnull,
        "Себестоимость, ₽": "max",
        "Статус": first_nonnull,
        "Признак товара": first_nonnull,
        "Базовая цена WB, ₽": "max",
        "Мин. цена WB, ₽": "max",
        "Текущая цена WB, ₽": "max",
        "Цена покупателя WB, ₽": "max",
        "Остаток WB, шт.": "max",
        "Оборач. общая, дн.": "max",
        "Целевая общая оборач., дн.": "max",
        "Маржа Total WB, %": "max",
        "Итоговая стратегия WB": first_nonnull,
        "Причина WB": first_nonnull,
        "Реком. цена WB, ₽": "max",
        "Базовая цена Ozon, ₽": "max",
        "Мин. цена Ozon, ₽": "max",
        "Текущая цена Ozon, ₽": "max",
        "Цена покупателя Ozon, ₽": "max",
        "Остаток Ozon, шт.": "max",
        "Оборач. общая, дн..1": "max",
        "Целевая общая оборач., дн..1": "max",
        "Маржа Total Ozon, %": "max",
        "Итоговая стратегия Ozon": first_nonnull,
        "Причина Ozon": first_nonnull,
        "Реком. цена Ozon, ₽": "max",
    }).reset_index().rename(columns={
        "Артикул": "article",
        "Направление": "legal_entity",
        "Бренд": "brand_repricer",
        "Себестоимость, ₽": "cost",
        "Статус": "status",
        "Признак товара": "trait",
        "Базовая цена WB, ₽": "wb_base_price",
        "Мин. цена WB, ₽": "wb_min_price",
        "Текущая цена WB, ₽": "wb_current_price",
        "Цена покупателя WB, ₽": "wb_buyer_price",
        "Остаток WB, шт.": "wb_stock",
        "Оборач. общая, дн.": "wb_turnover_days",
        "Целевая общая оборач., дн.": "wb_target_turnover_days",
        "Маржа Total WB, %": "wb_margin_pct",
        "Итоговая стратегия WB": "wb_strategy",
        "Причина WB": "wb_reason",
        "Реком. цена WB, ₽": "wb_rec_price",
        "Базовая цена Ozon, ₽": "ozon_base_price",
        "Мин. цена Ozon, ₽": "ozon_min_price",
        "Текущая цена Ozon, ₽": "ozon_current_price",
        "Цена покупателя Ozon, ₽": "ozon_buyer_price",
        "Остаток Ozon, шт.": "ozon_stock_repricer",
        "Оборач. общая, дн..1": "ozon_turnover_days",
        "Целевая общая оборач., дн..1": "ozon_target_turnover_days",
        "Маржа Total Ozon, %": "ozon_margin_pct",
        "Итоговая стратегия Ozon": "ozon_strategy",
        "Причина Ozon": "ozon_reason",
        "Реком. цена Ozon, ₽": "ozon_rec_price",
    })

    plan_agg = plan.groupby("article_key").agg({
        "Артикул": first_nonnull,
        "Юрлицо": first_nonnull,
        "Бренд": first_nonnull,
        "Сегмент": first_nonnull,
        "КЗ": first_nonnull,
        "ВК": first_nonnull,
        "ABC": first_nonnull,
        "Срок": "max",
        "Фев-26*": "max",
        "2026-03-26 00:00:00": "max",
        "2026-04-26 00:00:00": "max",
        "Score": "max",
        "wMoM%": "max",
        "Факт14м": "max",
        "Прогноз6м": "max",
    }).reset_index().rename(columns={
        "Артикул": "article_plan",
        "Юрлицо": "legal_entity_plan",
        "Бренд": "brand_plan",
        "Сегмент": "segment",
        "КЗ": "plan_has_kz_raw",
        "ВК": "plan_has_vk_raw",
        "ABC": "abc",
        "Срок": "lead_time_days",
        "Фев-26*": "plan_feb26_units",
        "2026-03-26 00:00:00": "plan_mar26_units",
        "2026-04-26 00:00:00": "plan_apr26_units",
        "Score": "score",
        "wMoM%": "wmom_pct",
        "Факт14м": "fact_14m_units",
        "Прогноз6м": "forecast_6m_units",
    })
    plan_agg["plan_has_kz"] = plan_agg["plan_has_kz_raw"].map(truthy_flag)
    plan_agg["plan_has_vk"] = plan_agg["plan_has_vk_raw"].map(truthy_flag)

    fact_agg = fact.groupby("article_key").agg({
        "MonthYear|Нашартикул": first_nonnull,
        "MonthYear|Юрлицо": first_nonnull,
        "MonthYear|Бренд": first_nonnull,
        "MonthYear|Актуальностьтовара": first_nonnull,
        "MonthYear|ЕстьвКЗ": first_nonnull,
        "MonthYear|ЕстьвВК": first_nonnull,
        "MonthYear|Теги": first_nonnull,
        "MonthYear|Срокпроизводства": "max",
        "Февраль-2026|Заказы,шт.": "max",
        "Февраль-2026|Заказы,руб.": "max",
        "Февраль-2026|Чистаявыручка,руб.": "max",
        "Февраль-2026|Вал.маржа,%": "max",
        "Total|Заказы,шт.": "max",
        "Total|Заказы,руб.": "max",
        "Total|Чистаявыручка,руб.": "max",
        "Total|Вал.маржа,%": "max",
    }).reset_index().rename(columns={
        "MonthYear|Нашартикул": "article_fact",
        "MonthYear|Юрлицо": "legal_entity_fact",
        "MonthYear|Бренд": "brand_fact",
        "MonthYear|Актуальностьтовара": "actuality",
        "MonthYear|ЕстьвКЗ": "fact_has_kz_raw",
        "MonthYear|ЕстьвВК": "fact_has_vk_raw",
        "MonthYear|Теги": "tags",
        "MonthYear|Срокпроизводства": "fact_lead_time_days",
        "Февраль-2026|Заказы,шт.": "fact_feb26_units",
        "Февраль-2026|Заказы,руб.": "fact_feb26_revenue",
        "Февраль-2026|Чистаявыручка,руб.": "fact_feb26_net_revenue",
        "Февраль-2026|Вал.маржа,%": "fact_feb26_margin_pct",
        "Total|Заказы,шт.": "fact_total_units",
        "Total|Заказы,руб.": "fact_total_revenue",
        "Total|Чистаявыручка,руб.": "fact_total_net_revenue",
        "Total|Вал.маржа,%": "fact_total_margin_pct",
    })
    fact_agg["fact_has_kz"] = fact_agg["fact_has_kz_raw"].map(truthy_flag)
    fact_agg["fact_has_vk"] = fact_agg["fact_has_vk_raw"].map(truthy_flag)

    leader_agg = leader.groupby("article_key").agg({
        "Бренд": "first",
        "Продукт": "first",
        "Артикул": "first",
        "Публикации": "sum",
        "Клики": "sum",
        "Заказы": "sum",
        "Стоимость контента": "sum",
        "Выручка": "sum",
        "Доход": "sum",
        "ROMI": "mean",
    }).reset_index().rename(columns={
        "Бренд": "brand_leader",
        "Продукт": "leader_product",
        "Артикул": "leader_mp_article_id",
        "Публикации": "content_posts",
        "Клики": "content_clicks",
        "Заказы": "content_orders",
        "Стоимость контента": "content_cost",
        "Выручка": "content_revenue",
        "Доход": "content_income",
        "ROMI": "content_romi",
    })

    orders_agg = orders.groupby("article_key").agg(
        orders_count=("Номер заказа", "count"),
        orders_units=("Количество", "sum"),
        orders_value=("Сумма отправления", "sum"),
        pending_count=("Статус", lambda s: s.isin(["Ожидает сборки", "Ожидает отгрузки"]).sum()),
        delivering_count=("Статус", lambda s: (s == "Доставляется").sum()),
        delivered_count=("Статус", lambda s: s.isin(["Доставлен", "Получен"]).sum()),
        last_order_at=("Принят в обработку", "max"),
        top_title=("Название товара", first_nonnull),
    ).reset_index()

    stocks_agg = stocks.groupby("article_key").agg({
        "Название товара": first_nonnull,
        "Остатки на складах Ozon|Доступно к продаже": "sum",
        "В пути на склад Ozon|В заявках на поставку": "sum",
        "|В поставках в пути": "sum",
        "Возвращаются от покупателей": "sum",
        "Готовим к вывозу по вашей заявке": "sum",
    }).reset_index().rename(columns={
        "Название товара": "stock_title",
        "Остатки на складах Ozon|Доступно к продаже": "ozon_available_stock_report",
        "В пути на склад Ozon|В заявках на поставку": "ozon_in_supply_request",
        "|В поставках в пути": "ozon_in_transit",
        "Возвращаются от покупателей": "returns_in_transit",
        "Готовим к вывозу по вашей заявке": "ready_to_withdraw",
    })

    returns_agg = returns.groupby("article_key").agg(
        returns_count=("Номер отправления", "count"),
        returns_units=("Количество возвращаемых товаров", "sum"),
        returns_value=("Стоимость товара", "sum"),
        top_return_reason=("Причина возврата", first_nonnull),
    ).reset_index()

    if not assignments.empty:
        assignments = assignments.sort_values(["owner_priority", "article_key"]).copy()
        owner_agg = assignments.groupby("article_key").agg({
            "owner": first_nonnull,
            "owner_source": first_nonnull,
            "registry_status": first_nonnull,
            "registry_has_kz": first_nonnull,
            "registry_has_vk": first_nonnull,
        }).reset_index().rename(columns={
            "owner": "owner_name",
            "owner_source": "owner_source",
            "registry_status": "registry_status",
            "registry_has_kz": "registry_has_kz",
            "registry_has_vk": "registry_has_vk",
        })
    else:
        owner_agg = pd.DataFrame(columns=["article_key", "owner_name", "owner_source", "registry_status", "registry_has_kz", "registry_has_vk"])

    all_keys = pd.Index(sorted(set(pd.concat([
        prod_agg["article_key"], repr_agg["article_key"], plan_agg["article_key"],
        fact_agg["article_key"], leader_agg["article_key"], orders_agg["article_key"],
        stocks_agg["article_key"], returns_agg["article_key"], owner_agg["article_key"]
    ]).dropna().unique())))

    sku = pd.DataFrame({"article_key": all_keys})
    for df in [repr_agg, prod_agg, plan_agg, fact_agg, leader_agg, orders_agg, stocks_agg, returns_agg, owner_agg]:
        sku = sku.merge(df, on="article_key", how="left")

    sku["article"] = sku["article"].fillna(sku["article_plan"]).fillna(sku["article_fact"]).fillna(sku["article_key"])
    sku["brand"] = sku["brand_repricer"].fillna(sku["brand_plan"]).fillna(sku["brand_fact"]).fillna(sku["brand_products"]).fillna(sku["brand_leader"])
    sku["legal_entity_final"] = sku["legal_entity"].fillna(sku["legal_entity_plan"]).fillna(sku["legal_entity_fact"])
    sku["product_name_final"] = sku["product_name"].fillna(sku["leader_product"]).fillna(sku["top_title"]).fillna(sku["stock_title"])

    brand_filter = str(args.brand_filter or "").strip()
    if brand_filter:
        brand_filter_norm = brand_filter.lower().replace("ё", "е")
        brand_mask = sku["brand"].fillna("").astype(str).str.strip().str.lower().str.replace("ё", "е", regex=False).eq(brand_filter_norm)
        sku = sku.loc[brand_mask].copy()

    numeric_columns = [
        "wb_current_price", "wb_min_price", "wb_rec_price", "wb_stock", "wb_turnover_days", "wb_target_turnover_days",
        "wb_margin_pct", "ozon_current_price", "ozon_min_price", "ozon_rec_price", "ozon_stock_repricer",
        "ozon_turnover_days", "ozon_target_turnover_days", "ozon_margin_pct", "ozon_fbo_stock_products", "reviews",
        "plan_feb26_units", "plan_mar26_units", "plan_apr26_units", "fact_feb26_units", "fact_feb26_revenue",
        "fact_feb26_net_revenue", "fact_feb26_margin_pct", "orders_count", "orders_units", "orders_value",
        "pending_count", "delivering_count", "delivered_count", "ozon_available_stock_report",
        "ozon_in_supply_request", "ozon_in_transit", "returns_in_transit", "returns_count", "returns_units",
        "returns_value", "content_romi", "content_revenue", "content_income", "content_clicks", "content_posts",
        "content_orders", "lead_time_days", "fact_lead_time_days"
    ]
    for c in numeric_columns:
        if c in sku.columns:
            sku[c] = pd.to_numeric(sku[c], errors="coerce")

    sku["ozon_stock_final"] = sku["ozon_available_stock_report"].fillna(sku["ozon_stock_repricer"]).fillna(sku["ozon_fbo_stock_products"]).fillna(0)
    sku["total_mp_stock"] = sku[["wb_stock", "ozon_stock_final"]].fillna(0).sum(axis=1)
    sku["price_below_min_wb"] = (sku["wb_current_price"] < sku["wb_min_price"]) & sku["wb_min_price"].notna()
    sku["price_below_min_ozon"] = (sku["ozon_current_price"] < sku["ozon_min_price"]) & sku["ozon_min_price"].notna()
    sku["plan_completion_feb26_pct"] = np.where((sku["plan_feb26_units"].fillna(0) > 0), sku["fact_feb26_units"].fillna(0) / sku["plan_feb26_units"], np.nan)
    sku["low_stock_flag"] = (sku["total_mp_stock"].fillna(0) < 50) | ((sku["ozon_in_transit"].fillna(0) > 0) & (sku["ozon_stock_final"].fillna(0) < 30))
    sku["under_plan_flag"] = (sku["plan_completion_feb26_pct"].fillna(1) < 0.8) & (sku["plan_feb26_units"].fillna(0) >= 100)
    sku["high_return_flag"] = (sku["returns_units"].fillna(0) >= 50)
    sku["wb_negative_margin_flag"] = sku["wb_margin_pct"].fillna(0) < 0
    sku["ozon_negative_margin_flag"] = sku["ozon_margin_pct"].fillna(0) < 0
    sku["negative_margin_flag"] = sku["wb_negative_margin_flag"] | sku["ozon_negative_margin_flag"]
    sku["to_work_wb_flag"] = sku["under_plan_flag"] & sku["wb_negative_margin_flag"]
    sku["to_work_ozon_flag"] = sku["under_plan_flag"] & sku["ozon_negative_margin_flag"]
    sku["to_work_flag"] = sku["under_plan_flag"] & sku["negative_margin_flag"]
    sku["min_margin_pct"] = sku[["wb_margin_pct", "ozon_margin_pct"]].min(axis=1, skipna=True)

    sku["assigned_flag"] = sku["owner_name"].notna() & sku["owner_name"].astype(str).str.strip().ne("")
    sku["external_kz_flag"] = sku.apply(lambda row: choose_bool(row, ["fact_has_kz", "plan_has_kz", "registry_has_kz"]), axis=1)
    sku["external_vk_flag"] = sku.apply(lambda row: choose_bool(row, ["fact_has_vk", "plan_has_vk", "registry_has_vk"]), axis=1)
    sku["external_any_flag"] = sku["external_kz_flag"] | sku["external_vk_flag"]
    sku["has_wb_flag"] = sku[["wb_current_price", "wb_min_price", "wb_stock", "wb_margin_pct"]].notna().any(axis=1) | sku["wb_stock"].fillna(0).gt(0)
    sku["has_ozon_flag"] = sku[["ozon_current_price", "ozon_min_price", "ozon_stock_final", "ozon_margin_pct"]].notna().any(axis=1) | sku["ozon_stock_final"].fillna(0).gt(0)

    sku["focus_score"] = (
        sku["to_work_flag"].fillna(False).astype(int) * 4
        + sku["under_plan_flag"].fillna(False).astype(int) * 2
        + sku["negative_margin_flag"].fillna(False).astype(int) * 2
        + sku["low_stock_flag"].fillna(False).astype(int)
        + sku["price_below_min_wb"].fillna(False).astype(int)
        + sku["price_below_min_ozon"].fillna(False).astype(int)
        + sku["high_return_flag"].fillna(False).astype(int)
        + sku["external_any_flag"].fillna(False).astype(int)
        + sku["assigned_flag"].fillna(False).astype(int) * 0
    )

    def build_focus_reasons(r):
        parts = []
        if bool(r["to_work_wb_flag"]) and bool(r["to_work_ozon_flag"]):
            parts.append("В работе: ниже плана и отрицательная маржа на WB и Ozon")
        elif bool(r["to_work_wb_flag"]):
            parts.append("В работе WB: ниже плана и отрицательная маржа")
        elif bool(r["to_work_ozon_flag"]):
            parts.append("В работе Ozon: ниже плана и отрицательная маржа")
        elif bool(r["to_work_flag"]):
            parts.append("В работе: ниже плана и отрицательная маржа")
        if bool(r["under_plan_flag"]):
            parts.append("Низкое выполнение плана")
        if bool(r["wb_negative_margin_flag"]):
            parts.append("Отрицательная маржа WB")
        if bool(r["ozon_negative_margin_flag"]):
            parts.append("Отрицательная маржа Ozon")
        if bool(r["low_stock_flag"]):
            parts.append("Низкий остаток")
        if bool(r["price_below_min_wb"]):
            parts.append("WB ниже min price")
        if bool(r["price_below_min_ozon"]):
            parts.append("Ozon ниже min price")
        if bool(r["high_return_flag"]):
            parts.append("Много возвратов")
        if pd.notna(r["content_romi"]) and r["content_romi"] > 300:
            parts.append("Сильный контент ROMI")
        if bool(r["external_kz_flag"]):
            parts.append("Есть внешний трафик КЗ")
        if bool(r["external_vk_flag"]):
            parts.append("Есть внешний трафик VK")
        if not bool(r["assigned_flag"]):
            parts.append("Owner не закреплён")
        return "; ".join(parts)

    sku["focus_reasons"] = sku.apply(build_focus_reasons, axis=1)

    brand_summary = sku.groupby("brand").agg(
        sku_count=("article_key", "count"),
        total_stock=("total_mp_stock", "sum"),
        orders_value=("orders_value", "sum"),
        feb_plan_units=("plan_feb26_units", "sum"),
        feb_fact_units=("fact_feb26_units", "sum"),
        returns_units=("returns_units", "sum"),
        avg_romi=("content_romi", "mean"),
        negative_margin_sku=("negative_margin_flag", "sum"),
        to_work_sku=("to_work_flag", "sum"),
        assigned_sku=("assigned_flag", "sum"),
        external_any_sku=("external_any_flag", "sum"),
    ).reset_index()
    brand_summary["plan_completion_feb26_pct"] = brand_summary["feb_fact_units"] / brand_summary["feb_plan_units"]

    focus = sku.sort_values(["to_work_flag", "focus_score", "plan_completion_feb26_pct", "min_margin_pct", "orders_value", "fact_total_revenue"], ascending=[False, False, True, True, False, False])
    work_queue = sku[sku["to_work_flag"]].sort_values(["plan_completion_feb26_pct", "min_margin_pct", "orders_value"], ascending=[True, True, False])

    summary = {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "dataFreshness": {
            "planFactMonth": "Февраль 2026",
            "ordersSnapshot": required_files["orders"],
            "contentPeriods": ["09.03.2026 - 15.03.2026", "16.03.2026 - 22.03.2026"],
            "launchPlanHorizon": "Апрель 2026 — Октябрь 2026",
            "ownerFiles": [str(p.name) for p in optional_paths.values() if p],
        },
        "cards": [
            {"label": "SKU в базе", "value": int(sku["article_key"].nunique()), "hint": f"В портал попал только бренд {brand_filter or 'Алтея'}"},
            {"label": "SKU в работе", "value": int(sku["to_work_flag"].sum()), "hint": "Ниже плана + отрицательная маржа хотя бы на одном MP"},
            {"label": "В работе WB", "value": int(sku["to_work_wb_flag"].sum()), "hint": "Ниже плана + маржа < 0 на WB"},
            {"label": "В работе Ozon", "value": int(sku["to_work_ozon_flag"].sum()), "hint": "Ниже плана + маржа < 0 на Ozon"},
            {"label": "Отрицательная маржа", "value": int(sku["negative_margin_flag"].sum()), "hint": "Хотя бы на одном MP маржа < 0"},
            {"label": "Закреплено за owner", "value": int(sku["assigned_flag"].sum()), "hint": "Нашли закрепление в рабочих реестрах"},
            {"label": "Без owner", "value": int((~sku["assigned_flag"]).sum()), "hint": "Нужно дозакрепить вручную"},
            {"label": "Внешний трафик КЗ", "value": int(sku["external_kz_flag"].sum()), "hint": "По факту/плану/реестрам"},
            {"label": "Внешний трафик VK", "value": int(sku["external_vk_flag"].sum()), "hint": "По факту/плану/реестрам"},
            {"label": "Остатки MP, шт.", "value": int(sku["total_mp_stock"].fillna(0).sum()), "hint": "WB + Ozon по текущему срезу"},
            {"label": "План Feb 2026, шт.", "value": int(round(sku["plan_feb26_units"].fillna(0).sum())), "hint": f"Из файла {required_files['plan']}"},
            {"label": "Факт Feb 2026, шт.", "value": int(round(sku["fact_feb26_units"].fillna(0).sum())), "hint": f"Из файла {required_files['plan']}"},
        ],
        "brandSummary": rows_to_records(brand_summary.sort_values("orders_value", ascending=False), [
            "brand", "sku_count", "total_stock", "orders_value", "feb_plan_units", "feb_fact_units",
            "plan_completion_feb26_pct", "returns_units", "avg_romi", "negative_margin_sku", "to_work_sku", "assigned_sku", "external_any_sku"
        ]),
        "focusTop": rows_to_records(focus[[
            "article", "brand", "product_name_final", "focus_score", "focus_reasons",
            "plan_completion_feb26_pct", "total_mp_stock", "content_romi", "owner_name",
            "external_kz_flag", "external_vk_flag"
        ]].head(16)),
        "topContent": rows_to_records(sku[sku["content_romi"].notna()].sort_values("content_romi", ascending=False)[[
            "article", "brand", "product_name_final", "content_romi", "content_income",
            "content_revenue", "content_posts", "content_clicks", "owner_name"
        ]].head(12)),
        "underPlan": rows_to_records(sku[sku["under_plan_flag"]].sort_values("plan_completion_feb26_pct")[[
            "article", "brand", "product_name_final", "plan_feb26_units", "fact_feb26_units",
            "plan_completion_feb26_pct", "total_mp_stock", "negative_margin_flag", "owner_name"
        ]].head(12)),
        "toWork": rows_to_records(work_queue[[
            "article", "brand", "product_name_final", "plan_completion_feb26_pct", "total_mp_stock",
            "wb_margin_pct", "ozon_margin_pct", "focus_reasons", "owner_name", "external_kz_flag", "external_vk_flag"
        ]].head(16)),
        "lowStock": rows_to_records(sku.sort_values("total_mp_stock")[[
            "article", "brand", "product_name_final", "total_mp_stock",
            "wb_stock", "ozon_stock_final", "ozon_in_transit", "orders_value", "owner_name"
        ]].head(12)),
        "topReturns": rows_to_records(sku.sort_values("returns_units", ascending=False)[[
            "article", "brand", "product_name_final", "returns_units", "returns_count", "top_return_reason", "owner_name"
        ]].head(12)),
        "unassigned": rows_to_records(sku[~sku["assigned_flag"]].sort_values(["to_work_flag", "focus_score", "orders_value"], ascending=[False, False, False])[[
            "article", "brand", "product_name_final", "focus_score", "focus_reasons", "plan_completion_feb26_pct", "wb_margin_pct", "ozon_margin_pct"
        ]].head(20)),
    }

    sku_records = []
    for _, r in sku.iterrows():
        channels = []
        if bool(r["external_kz_flag"]):
            channels.append("КЗ")
        if bool(r["external_vk_flag"]):
            channels.append("VK")
        sku_records.append({
            "article": clean_val(r["article"]),
            "articleKey": clean_val(r["article_key"]),
            "brand": clean_val(r["brand"]),
            "legalEntity": clean_val(r["legal_entity_final"]),
            "name": clean_val(r["product_name_final"]),
            "category": clean_val(r["category"]),
            "type": clean_val(r["type"]),
            "segment": clean_val(r["segment"]),
            "abc": clean_val(r["abc"]),
            "leadTimeDays": clean_val(r["lead_time_days"] if pd.notna(r["lead_time_days"]) else r["fact_lead_time_days"]),
            "status": clean_val(r["status"] if pd.notna(r["status"]) else r["actuality"]),
            "registryStatus": clean_val(r["registry_status"]),
            "rating": clean_val(r["rating"]),
            "reviews": clean_val(r["reviews"]),
            "focusScore": clean_val(r["focus_score"]),
            "focusReasons": clean_val(r["focus_reasons"]),
            "owner": {
                "name": clean_val(r["owner_name"]),
                "source": clean_val(r["owner_source"]),
                "registryStatus": clean_val(r["registry_status"]),
            },
            "traffic": {
                "kz": bool(r["external_kz_flag"]),
                "vk": bool(r["external_vk_flag"]),
                "channels": channels,
            },
            "wb": {
                "currentPrice": clean_val(r["wb_current_price"]),
                "minPrice": clean_val(r["wb_min_price"]),
                "recPrice": clean_val(r["wb_rec_price"]),
                "stock": clean_val(r["wb_stock"]),
                "turnoverDays": clean_val(r["wb_turnover_days"]),
                "targetTurnoverDays": clean_val(r["wb_target_turnover_days"]),
                "marginPct": clean_val(r["wb_margin_pct"]),
                "strategy": clean_val(r["wb_strategy"]),
                "reason": clean_val(r["wb_reason"]),
                "belowMin": bool(r["price_below_min_wb"]) if pd.notna(r["price_below_min_wb"]) else False,
            },
            "ozon": {
                "currentPrice": clean_val(r["ozon_current_price"] if pd.notna(r["ozon_current_price"]) else r["ozon_price_products"]),
                "minPrice": clean_val(r["ozon_min_price"]),
                "recPrice": clean_val(r["ozon_rec_price"]),
                "stock": clean_val(r["ozon_stock_final"]),
                "stockProducts": clean_val(r["ozon_fbo_stock_products"]),
                "stockRepricer": clean_val(r["ozon_stock_repricer"]),
                "stockInSupplyRequest": clean_val(r["ozon_in_supply_request"]),
                "stockInTransit": clean_val(r["ozon_in_transit"]),
                "turnoverDays": clean_val(r["ozon_turnover_days"]),
                "targetTurnoverDays": clean_val(r["ozon_target_turnover_days"]),
                "marginPct": clean_val(r["ozon_margin_pct"]),
                "strategy": clean_val(r["ozon_strategy"]),
                "reason": clean_val(r["ozon_reason"]),
                "belowMin": bool(r["price_below_min_ozon"]) if pd.notna(r["price_below_min_ozon"]) else False,
            },
            "planFact": {
                "planFeb26Units": clean_val(r["plan_feb26_units"]),
                "factFeb26Units": clean_val(r["fact_feb26_units"]),
                "completionFeb26Pct": clean_val(r["plan_completion_feb26_pct"]),
                "planMar26Units": clean_val(r["plan_mar26_units"]),
                "planApr26Units": clean_val(r["plan_apr26_units"]),
                "forecast6mUnits": clean_val(r["forecast_6m_units"]),
                "factFeb26Revenue": clean_val(r["fact_feb26_revenue"]),
                "factFeb26NetRevenue": clean_val(r["fact_feb26_net_revenue"]),
                "factFeb26MarginPct": clean_val(r["fact_feb26_margin_pct"]),
                "factTotalRevenue": clean_val(r["fact_total_revenue"]),
            },
            "orders": {
                "count": clean_val(r["orders_count"]),
                "units": clean_val(r["orders_units"]),
                "value": clean_val(r["orders_value"]),
                "pendingCount": clean_val(r["pending_count"]),
                "deliveringCount": clean_val(r["delivering_count"]),
                "deliveredCount": clean_val(r["delivered_count"]),
                "lastOrderAt": clean_val(r["last_order_at"]),
            },
            "returns": {
                "count": clean_val(r["returns_count"]),
                "units": clean_val(r["returns_units"]),
                "value": clean_val(r["returns_value"]),
                "inTransit": clean_val(r["returns_in_transit"]),
                "topReason": clean_val(r["top_return_reason"]),
            },
            "content": {
                "romi": clean_val(r["content_romi"]),
                "income": clean_val(r["content_income"]),
                "revenue": clean_val(r["content_revenue"]),
                "clicks": clean_val(r["content_clicks"]),
                "posts": clean_val(r["content_posts"]),
                "orders": clean_val(r["content_orders"]),
            },
            "flags": {
                "hasWB": bool(r["has_wb_flag"]),
                "hasOzon": bool(r["has_ozon_flag"]),
                "lowStock": bool(r["low_stock_flag"]) if pd.notna(r["low_stock_flag"]) else False,
                "underPlan": bool(r["under_plan_flag"]) if pd.notna(r["under_plan_flag"]) else False,
                "highReturn": bool(r["high_return_flag"]) if pd.notna(r["high_return_flag"]) else False,
                "negativeMargin": bool(r["negative_margin_flag"]) if pd.notna(r["negative_margin_flag"]) else False,
                "wbNegativeMargin": bool(r["wb_negative_margin_flag"]) if pd.notna(r["wb_negative_margin_flag"]) else False,
                "ozonNegativeMargin": bool(r["ozon_negative_margin_flag"]) if pd.notna(r["ozon_negative_margin_flag"]) else False,
                "toWork": bool(r["to_work_flag"]) if pd.notna(r["to_work_flag"]) else False,
                "toWorkWB": bool(r["to_work_wb_flag"]) if pd.notna(r["to_work_wb_flag"]) else False,
                "toWorkOzon": bool(r["to_work_ozon_flag"]) if pd.notna(r["to_work_ozon_flag"]) else False,
                "assigned": bool(r["assigned_flag"]),
                "hasExternalTraffic": bool(r["external_any_flag"]),
                "hasKZ": bool(r["external_kz_flag"]),
                "hasVK": bool(r["external_vk_flag"]),
            },
        })

    launch_out = launches[[
        "Группа отчетности", "ТЕГ: база/тренд", "SKU", "Месяц запуска", "Статус", "Производство",
        "Название", "Суб категория", "Предмет", "Характеристика", "Целевая себестоимость",
        "СРЦ с НДС (как в ЛК, формула)", "РРЦ с НДС", "МРЦ с НДС",
        "Валовая маржа, %", "Валовая маржа, руб", "Выручка, руб.\n (с НДС) без СПП",
        "Май", "Июнь", "Июль", "Август"
    ]].copy()
    launch_out.columns = [
        "reportGroup", "tag", "skuCount", "launchMonth", "status", "production",
        "name", "subCategory", "itemType", "characteristic", "targetCost", "srcPriceVat",
        "rrpVat", "mrpVat", "grossMarginPct", "grossMarginRub", "plannedRevenue",
        "may", "june", "july", "august"
    ]


    repricer_columns = {
        "Артикул": first_nonnull,
        "Направление": first_nonnull,
        "Бренд": first_nonnull,
        "Статус": first_nonnull,
        "Признак товара": first_nonnull,
        "Себестоимость, ₽": "max",
        "Базовая цена WB, ₽": "max",
        "Мин. цена WB, ₽": "max",
        "Текущая цена WB, ₽": "max",
        "Цена покупателя WB, ₽": "max",
        "Остаток WB, шт.": "max",
        "Маржа Total WB, %": "max",
        "Оборач. общая, дн.": "max",
        "Целевая общая оборач., дн.": "max",
        "Итоговая стратегия WB": first_nonnull,
        "Причина WB": first_nonnull,
        "Реком. цена WB, ₽": "max",
        "Изм. WB к текущей, %": "max",
        "Новая цена покупателя WB, ₽": "max",
        "Новая маржа Total WB, %": "max",
        "Мин. порог маржи без рекламы WB, %": "max",
        "Базовый порог маржи без рекламы WB, %": "max",
        "Текущая маржа без рекламы WB, %": "max",
        "Новая маржа без рекламы WB, %": "max",
        "Базовая цена Ozon, ₽": "max",
        "Мин. цена Ozon, ₽": "max",
        "Текущая цена Ozon, ₽": "max",
        "Цена покупателя Ozon, ₽": "max",
        "Остаток Ozon, шт.": "max",
        "Маржа Total Ozon, %": "max",
        "Оборач. общая, дн..1": "max",
        "Целевая общая оборач., дн..1": "max",
        "Итоговая стратегия Ozon": first_nonnull,
        "Причина Ozon": first_nonnull,
        "Реком. цена Ozon, ₽": "max",
        "Изм. Ozon к текущей, %": "max",
        "Новая цена покупателя Ozon, ₽": "max",
        "Новая маржа Total Ozon, %": "max",
        "Мин. порог маржи без рекламы Ozon, %": "max",
        "Базовый порог маржи без рекламы Ozon, %": "max",
        "Текущая маржа без рекламы Ozon, %": "max",
        "Новая маржа без рекламы Ozon, %": "max",
    }
    repricer_existing = {col: agg for col, agg in repricer_columns.items() if col in repricer.columns}
    repricer_brand = repricer[repricer["Бренд"].astype(str).str.strip() == args.brand_filter].copy()
    repricer_records = []
    repricer_summary = {
        "skuCount": 0,
        "wbChangeCount": 0,
        "ozonChangeCount": 0,
        "wbBelowMinCount": 0,
        "ozonBelowMinCount": 0,
        "wbMarginRiskCount": 0,
        "ozonMarginRiskCount": 0,
        "wbEqualizeCount": 0,
        "ozonEqualizeCount": 0,
        "wbTurnoverCount": 0,
        "ozonTurnoverCount": 0,
    }
    if not repricer_brand.empty and repricer_existing:
        repricer_brand_agg = repricer_brand.groupby("article_key").agg(repricer_existing).reset_index()
        sku_name_map = sku.set_index("article_key")["product_name_final"].to_dict()
        sku_article_map = sku.set_index("article_key")["article"].to_dict()
        for _, row in repricer_brand_agg.iterrows():
            wb_changed = pd.notna(row.get("Реком. цена WB, ₽")) and pd.notna(row.get("Текущая цена WB, ₽")) and abs(float(row.get("Реком. цена WB, ₽")) - float(row.get("Текущая цена WB, ₽"))) >= 1
            ozon_changed = pd.notna(row.get("Реком. цена Ozon, ₽")) and pd.notna(row.get("Текущая цена Ozon, ₽")) and abs(float(row.get("Реком. цена Ozon, ₽")) - float(row.get("Текущая цена Ozon, ₽"))) >= 1
            wb_below = pd.notna(row.get("Текущая цена WB, ₽")) and pd.notna(row.get("Мин. цена WB, ₽")) and float(row.get("Текущая цена WB, ₽")) < float(row.get("Мин. цена WB, ₽"))
            ozon_below = pd.notna(row.get("Текущая цена Ozon, ₽")) and pd.notna(row.get("Мин. цена Ozon, ₽")) and float(row.get("Текущая цена Ozon, ₽")) < float(row.get("Мин. цена Ozon, ₽"))
            wb_margin_risk = pd.notna(row.get("Текущая маржа без рекламы WB, %")) and pd.notna(row.get("Мин. порог маржи без рекламы WB, %")) and float(row.get("Текущая маржа без рекламы WB, %")) < float(row.get("Мин. порог маржи без рекламы WB, %"))
            ozon_margin_risk = pd.notna(row.get("Текущая маржа без рекламы Ozon, %")) and pd.notna(row.get("Мин. порог маржи без рекламы Ozon, %")) and float(row.get("Текущая маржа без рекламы Ozon, %")) < float(row.get("Мин. порог маржи без рекламы Ozon, %"))
            if wb_changed:
                repricer_summary["wbChangeCount"] += 1
            if ozon_changed:
                repricer_summary["ozonChangeCount"] += 1
            if wb_below:
                repricer_summary["wbBelowMinCount"] += 1
            if ozon_below:
                repricer_summary["ozonBelowMinCount"] += 1
            if wb_margin_risk:
                repricer_summary["wbMarginRiskCount"] += 1
            if ozon_margin_risk:
                repricer_summary["ozonMarginRiskCount"] += 1
            if row.get("Итоговая стратегия WB") == "Выравнивание цен MP":
                repricer_summary["wbEqualizeCount"] += 1
            if row.get("Итоговая стратегия Ozon") == "Выравнивание цен MP":
                repricer_summary["ozonEqualizeCount"] += 1
            if row.get("Итоговая стратегия WB") == "Оборачиваемость общая":
                repricer_summary["wbTurnoverCount"] += 1
            if row.get("Итоговая стратегия Ozon") == "Оборачиваемость общая":
                repricer_summary["ozonTurnoverCount"] += 1
            repricer_records.append({
                "articleKey": clean_val(row.get("article_key")),
                "article": clean_val(sku_article_map.get(row.get("article_key")) or row.get("Артикул")),
                "name": clean_val(sku_name_map.get(row.get("article_key")) or row.get("Артикул")),
                "brand": clean_val(row.get("Бренд")),
                "legalEntity": clean_val(row.get("Направление")),
                "status": clean_val(row.get("Статус")),
                "tag": clean_val(row.get("Признак товара")),
                "cost": clean_val(row.get("Себестоимость, ₽")),
                "wb": {
                    "basePrice": clean_val(row.get("Базовая цена WB, ₽")),
                    "minPrice": clean_val(row.get("Мин. цена WB, ₽")),
                    "currentPrice": clean_val(row.get("Текущая цена WB, ₽")),
                    "buyerPrice": clean_val(row.get("Цена покупателя WB, ₽")),
                    "stock": clean_val(row.get("Остаток WB, шт.")),
                    "turnoverDays": clean_val(row.get("Оборач. общая, дн.")),
                    "targetTurnoverDays": clean_val(row.get("Целевая общая оборач., дн.")),
                    "marginPct": clean_val(row.get("Маржа Total WB, %")),
                    "recPrice": clean_val(row.get("Реком. цена WB, ₽")),
                    "changePct": clean_val(row.get("Изм. WB к текущей, %")),
                    "newBuyerPrice": clean_val(row.get("Новая цена покупателя WB, ₽")),
                    "newMarginPct": clean_val(row.get("Новая маржа Total WB, %")),
                    "strategy": clean_val(row.get("Итоговая стратегия WB")),
                    "reason": clean_val(row.get("Причина WB")),
                    "marginNoAdsMinPct": clean_val(row.get("Мин. порог маржи без рекламы WB, %")),
                    "marginNoAdsBasePct": clean_val(row.get("Базовый порог маржи без рекламы WB, %")),
                    "marginNoAdsCurrentPct": clean_val(row.get("Текущая маржа без рекламы WB, %")),
                    "marginNoAdsNewPct": clean_val(row.get("Новая маржа без рекламы WB, %")),
                },
                "ozon": {
                    "basePrice": clean_val(row.get("Базовая цена Ozon, ₽")),
                    "minPrice": clean_val(row.get("Мин. цена Ozon, ₽")),
                    "currentPrice": clean_val(row.get("Текущая цена Ozon, ₽")),
                    "buyerPrice": clean_val(row.get("Цена покупателя Ozon, ₽")),
                    "stock": clean_val(row.get("Остаток Ozon, шт.")),
                    "turnoverDays": clean_val(row.get("Оборач. общая, дн..1")),
                    "targetTurnoverDays": clean_val(row.get("Целевая общая оборач., дн..1")),
                    "marginPct": clean_val(row.get("Маржа Total Ozon, %")),
                    "recPrice": clean_val(row.get("Реком. цена Ozon, ₽")),
                    "changePct": clean_val(row.get("Изм. Ozon к текущей, %")),
                    "newBuyerPrice": clean_val(row.get("Новая цена покупателя Ozon, ₽")),
                    "newMarginPct": clean_val(row.get("Новая маржа Total Ozon, %")),
                    "strategy": clean_val(row.get("Итоговая стратегия Ozon")),
                    "reason": clean_val(row.get("Причина Ozon")),
                    "marginNoAdsMinPct": clean_val(row.get("Мин. порог маржи без рекламы Ozon, %")),
                    "marginNoAdsBasePct": clean_val(row.get("Базовый порог маржи без рекламы Ozon, %")),
                    "marginNoAdsCurrentPct": clean_val(row.get("Текущая маржа без рекламы Ozon, %")),
                    "marginNoAdsNewPct": clean_val(row.get("Новая маржа без рекламы Ozon, %")),
                },
            })
        repricer_summary["skuCount"] = len(repricer_records)


    seed_comments = {"comments": [], "tasks": []}
    for _, row in work_queue.head(5).iterrows():
        article_key = clean_val(row["article_key"])
        label = clean_val(row["product_name_final"] or row["article"])
        task_owner = clean_val(row["owner_name"]) or "Бренд-лид"
        seed_comments["comments"].append({
            "articleKey": article_key,
            "author": "Система",
            "team": "Финансы / МП",
            "createdAt": datetime.now().replace(microsecond=0).isoformat(),
            "text": f"Проверить SKU '{label}': товар ниже плана и уходит в отрицательную маржу. Нужны решение по цене, промо и дальнейшему объёму.",
            "type": "risk"
        })
        seed_comments["tasks"].append({
            "articleKey": article_key,
            "owner": task_owner,
            "due": datetime.now().date().isoformat(),
            "status": "open",
            "title": "Разобрать маржу, цену и план действий по SKU в работе"
        })
    for _, row in sku[~sku["assigned_flag"]].sort_values(["focus_score", "orders_value"], ascending=[False, False]).head(3).iterrows():
        article_key = clean_val(row["article_key"])
        seed_comments["tasks"].append({
            "articleKey": article_key,
            "owner": "Назначить owner",
            "due": datetime.now().date().isoformat(),
            "status": "open",
            "title": "Закрепить ответственного за SKU"
        })

    (out / "dashboard.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    (out / "skus.json").write_text(json.dumps(sku_records, ensure_ascii=False, indent=2), encoding="utf-8")
    (out / "launches.json").write_text(json.dumps(rows_to_records(launch_out), ensure_ascii=False, indent=2), encoding="utf-8")
    (out / "meetings.json").write_text(json.dumps(MEETING_RHYTHM, ensure_ascii=False, indent=2), encoding="utf-8")
    (out / "seed_comments.json").write_text(json.dumps(seed_comments, ensure_ascii=False, indent=2), encoding="utf-8")
    (out / "repricer.json").write_text(json.dumps({"generatedAt": datetime.now().replace(microsecond=0).isoformat(), "summary": repricer_summary, "rows": repricer_records}, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Done. JSON written to {out}")


if __name__ == "__main__":
    main()
