"""
Skill handlers — return merchant-specific responses by reading the merchant
profile (name, opening_hours, price_level, tags, specific_fields) at call time.

Handler signature: handler(payload, merchant) -> dict
  - payload : skill call args (e.g. check_in date, party_size)
  - merchant: normalized merchant dict from merchant_service.normalize_merchant
              (may be None for backward compat — handlers fall back to generic data)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

TZ_CN = timezone(timedelta(hours=8))


def _today(offset_days: int = 0) -> str:
    return (datetime.now(TZ_CN) + timedelta(days=offset_days)).strftime("%Y-%m-%d")


def _now_iso(offset_hours: int = 0) -> str:
    return (datetime.now(TZ_CN) + timedelta(hours=offset_hours)).isoformat(timespec="seconds")


def _name(merchant: Optional[dict], default_zh: str = "TourSkill 商家", default_en: str = "TourSkill Merchant") -> Dict[str, str]:
    if not merchant:
        return {"zh": default_zh, "en": default_en}
    n = merchant.get("name") or {}
    return {"zh": n.get("zh") or default_zh, "en": n.get("en") or default_en}


def _sf(merchant: Optional[dict]) -> Dict[str, Any]:
    return (merchant or {}).get("specific_fields") or {}


def _tags(merchant: Optional[dict]) -> List[str]:
    return (merchant or {}).get("tags") or []


def execute_skill(
    skill_name: str,
    payload: Dict[str, Any],
    merchant: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    handler = SKILL_HANDLERS.get(skill_name)
    if handler:
        return handler(payload, merchant)
    return {"message": f"Skill '{skill_name}' executed successfully", "received_payload": payload, "merchant_id": (merchant or {}).get("merchant_id")}


# ─── Hotel Skills ─────────────────────────────────────────────────────

def _star_to_price(star: int) -> int:
    """Base nightly rate by star tier (CNY)."""
    return {1: 180, 2: 380, 3: 680, 4: 1480, 5: 3200}.get(star, 700)


def _check_availability(p: Dict[str, Any], m: Optional[dict]) -> Dict[str, Any]:
    check_in = p.get("check_in", _today(3))
    check_out = p.get("check_out", _today(5))
    name = _name(m, "酒店", "Hotel")
    sf = _sf(m)
    star = int(sf.get("star_rating", 4))
    has_pool = bool(sf.get("pool"))
    has_spa = bool(sf.get("spa"))
    has_helipad = bool(sf.get("helipad"))
    has_dorms = bool(sf.get("dorms"))
    base = _star_to_price(star)
    tags = _tags(m)

    view = "lake_view" if any("lake" in t.lower() for t in tags) else "city_view"
    amenities = ["wifi", "breakfast"]
    if has_pool:
        amenities.append("pool_access")
    if has_spa:
        amenities.append("spa_access")
    if star >= 4:
        amenities.append(view)
    if has_helipad:
        amenities.append("helipad_transfer")

    rooms: List[Dict[str, Any]] = []

    # Dorm option for hostels
    if has_dorms:
        rooms.append({
            "room_type": "dorm_bed",
            "room_name": {"zh": "多人间床位", "en": "Dorm Bed"},
            "price_per_night": {"amount": max(60, int(base * 0.4)), "currency": "CNY"},
            "max_guests": 1,
            "amenities": ["wifi", "shared_kitchen"],
            "cancellation_policy": {
                "free_cancel_before": f"{check_in}T18:00:00+08:00",
                "penalty_after": {"amount": int(base * 0.2), "currency": "CNY"},
            },
            "remaining_count": 8,
        })

    rooms.append({
        "room_type": "deluxe",
        "room_name": {"zh": "豪华房", "en": "Deluxe Room"},
        "price_per_night": {"amount": base, "currency": "CNY"},
        "max_guests": 2,
        "amenities": amenities,
        "cancellation_policy": {
            "free_cancel_before": f"{check_in}T18:00:00+08:00",
            "penalty_after": {"amount": int(base * 0.5), "currency": "CNY"},
        },
        "remaining_count": 3,
    })

    if star >= 4:
        rooms.append({
            "room_type": "suite",
            "room_name": {"zh": "套房", "en": "Suite"},
            "price_per_night": {"amount": int(base * 2.2), "currency": "CNY"},
            "max_guests": 3,
            "amenities": amenities + ["lounge_access", "minibar"],
            "cancellation_policy": {
                "free_cancel_before": f"{check_in}T18:00:00+08:00",
                "penalty_after": {"amount": int(base * 1.1), "currency": "CNY"},
            },
            "remaining_count": 1,
        })

    return {
        "merchant": name,
        "available": True,
        "rooms": rooms,
        "total_nights": 2,
        "taxes_included": True,
        "check_in": check_in,
        "check_out": check_out,
        "star_rating": star,
    }


def _get_rates(p: Dict[str, Any], m: Optional[dict]) -> Dict[str, Any]:
    check_in = p.get("check_in", _today(3))
    sf = _sf(m)
    star = int(sf.get("star_rating", 4))
    base = _star_to_price(star)
    weekend_rate = int(base * 1.18)
    subtotal = base + weekend_rate
    taxes = int(subtotal * 0.05)
    return {
        "merchant": _name(m, "酒店", "Hotel"),
        "room_type": p.get("room_type", "deluxe"),
        "nightly_rates": [
            {"date": check_in, "amount": base, "currency": "CNY", "is_weekend": False},
            {"date": _today(4), "amount": weekend_rate, "currency": "CNY", "is_weekend": True},
        ],
        "subtotal": subtotal,
        "taxes_and_fees": taxes,
        "total": subtotal + taxes,
        "currency": "CNY",
        "includes_breakfast": True,
        "deposit_required": {"amount": int(base * 0.4), "currency": "CNY"},
    }


def _create_booking(p: Dict[str, Any], m: Optional[dict]) -> Dict[str, Any]:
    booking_id = f"BK-{uuid.uuid4().hex[:8].upper()}"
    name = _name(m, "酒店", "Hotel")
    return {
        "merchant": name,
        "merchant_did": (m or {}).get("did"),
        "booking_id": booking_id,
        "status": "pending_confirmation",
        "confirmation_deadline": _now_iso(offset_hours=4),
        "payment_url": f"https://pay.tourskill.local/booking/{booking_id}",
        "cancellation_policy": {"free_cancel_before": f"{_today(3)}T18:00:00+08:00"},
        "booking_hash": f"0x{uuid.uuid4().hex}",
    }


def _get_cancellation_policy(_p: Dict[str, Any], m: Optional[dict]) -> Dict[str, Any]:
    return {
        "merchant": _name(m, "酒店", "Hotel"),
        "policies": [
            {
                "room_type": "all",
                "rules": [
                    {
                        "condition": "cancel_before_48h",
                        "description": {"zh": "入住前48小时免费取消", "en": "Free cancellation 48h before check-in"},
                        "refund_percentage": 100,
                    },
                    {
                        "condition": "cancel_within_48h",
                        "description": {"zh": "入住前48小时内取消收取首晚房费", "en": "First night charge within 48h"},
                        "refund_percentage": 0,
                        "penalty": "first_night",
                    },
                    {
                        "condition": "no_show",
                        "description": {"zh": "未入住扣全款", "en": "Full charge for no-show"},
                        "refund_percentage": 0,
                    },
                ],
            }
        ],
    }


# ─── Restaurant Skills ────────────────────────────────────────────────

def _parse_business_hours(opening_hours: Optional[str]) -> Dict[str, str]:
    """Best-effort parse of 'opening_hours' string into lunch/dinner windows."""
    if not opening_hours:
        return {"lunch": "11:00-14:00", "dinner": "17:00-21:30"}
    parts = [s.strip() for s in opening_hours.split(",")]
    if len(parts) >= 2:
        return {"lunch": parts[0], "dinner": parts[1]}
    return {"all_day": opening_hours}


def _check_table_availability(p: Dict[str, Any], m: Optional[dict]) -> Dict[str, Any]:
    sf = _sf(m)
    price_level = int((m or {}).get("price_level") or 2)
    avg_spend = int(sf.get("avg_spend") or (price_level * 80))
    has_private_room = price_level >= 3

    slots: List[Dict[str, Any]] = [{
        "time": p.get("time", "18:00"),
        "seating": "window",
        "seating_name": {"zh": "临窗座位", "en": "Window seat"},
        "max_party": 4,
        "estimated_duration_minutes": 90,
        "deposit_required": False,
    }]

    if has_private_room:
        slots.append({
            "time": "18:30",
            "seating": "private_room",
            "seating_name": {"zh": "包间", "en": "Private Room"},
            "max_party": 10,
            "estimated_duration_minutes": 120,
            "deposit_required": True,
            "deposit_amount": {"amount": max(300, avg_spend * 2), "currency": "CNY"},
            "minimum_spend": {"amount": max(1500, avg_spend * 8), "currency": "CNY"},
        })

    return {
        "merchant": _name(m, "餐厅", "Restaurant"),
        "available": True,
        "slots": slots,
        "business_hours": _parse_business_hours((m or {}).get("opening_hours")),
        "avg_spend_per_person": {"amount": avg_spend, "currency": "CNY"},
    }


def _build_menu_items(name: Dict[str, str], cuisine: str, sigs: List[str], avg_spend: int, vegetarian: bool) -> List[Dict[str, Any]]:
    """Build a believable menu from signature_dishes + cuisine + avg_spend."""
    items: List[Dict[str, Any]] = []
    base = max(38, int(avg_spend * 0.45))

    if sigs:
        for i, dish in enumerate(sigs[:4]):
            items.append({
                "id": f"sig-{i + 1:03d}",
                "name": {"zh": dish, "en": dish},
                "description": {
                    "zh": f"{name['zh']}招牌：{dish}",
                    "en": f"{name['en']} signature: {dish}",
                },
                "price": {"amount": base + i * 30, "currency": "CNY"},
                "serves": "2-3",
                "dietary_tags": [],
                "allergens": [],
                "spicy_level": 1 if "Sichuan" in cuisine or "Hot" in cuisine else 0,
                "is_seasonal": False,
            })
    else:
        # Generic fallback when no signature dishes provided
        items.append({
            "id": "house-001",
            "name": {"zh": f"{cuisine}招牌菜", "en": f"House Special — {cuisine}"},
            "description": {
                "zh": f"{name['zh']}主厨推荐",
                "en": f"Chef's recommendation at {name['en']}",
            },
            "price": {"amount": base, "currency": "CNY"},
            "serves": "2-3",
            "dietary_tags": [],
            "allergens": [],
            "spicy_level": 0,
            "is_seasonal": False,
        })

    if vegetarian:
        items.append({
            "id": "veg-001",
            "name": {"zh": "时令素菜", "en": "Seasonal Vegetable"},
            "description": {"zh": "新鲜时令蔬菜，可调整为纯素", "en": "Fresh seasonal vegetable, vegan on request"},
            "price": {"amount": max(38, int(base * 0.6)), "currency": "CNY"},
            "serves": "2-3",
            "dietary_tags": ["vegetarian", "vegan"],
            "allergens": [],
            "spicy_level": 0,
            "is_seasonal": True,
        })

    return items


def _get_menu(p: Dict[str, Any], m: Optional[dict]) -> Dict[str, Any]:
    name = _name(m, "餐厅", "Restaurant")
    sf = _sf(m)
    cuisine = sf.get("cuisine_type") or "Local Cuisine"
    avg_spend = int(sf.get("avg_spend") or 100)
    sigs = sf.get("signature_dishes") or []
    vegetarian = bool(sf.get("vegetarian_options"))

    items = _build_menu_items(name, cuisine, sigs, avg_spend, vegetarian)

    dietary_filter = p.get("dietary_filter") or []
    if dietary_filter:
        items = [i for i in items if any(t in i["dietary_tags"] for t in dietary_filter)]

    response: Dict[str, Any] = {
        "restaurant_name": name,
        "merchant_did": (m or {}).get("did"),
        "cuisine_type": cuisine,
        "menu_version": "2026-Q2",
        "avg_spend_per_person": {"amount": avg_spend, "currency": "CNY"},
        "categories": [
            {"name": {"zh": "招牌菜", "en": "Signature Dishes"}, "items": items},
        ],
    }

    # Set meal only when budget supports it
    if avg_spend >= 100 and len(items) >= 2:
        response["set_meals"] = [{
            "id": "set-001",
            "name": {
                "zh": f"{name['zh']}经典套餐",
                "en": f"{name['en']} Classic Set",
            },
            "price_per_person": {"amount": int(avg_spend * 1.2), "currency": "CNY"},
            "min_guests": 4,
            "includes": [i["id"] for i in items[:3]],
        }]

    return response


def _reserve_table(p: Dict[str, Any], m: Optional[dict]) -> Dict[str, Any]:
    res_id = f"RES-{uuid.uuid4().hex[:8].upper()}"
    date = p.get("date", _today(1))
    time = p.get("time", "18:00")
    try:
        cancel_hour = max(0, int(time[:2]) - 2)
    except ValueError:
        cancel_hour = 16
    return {
        "merchant": _name(m, "餐厅", "Restaurant"),
        "merchant_did": (m or {}).get("did"),
        "reservation_id": res_id,
        "status": "confirmed",
        "details": {
            "date": date,
            "time": time,
            "party_size": p.get("party_size", 2),
            "seating": p.get("seating_preference", "window"),
            "hold_time_minutes": 15,
        },
        "pre_ordered_items": p.get("pre_order_items") or [],
        "cancellation": {
            "free_cancel_before": f"{date}T{cancel_hour:02d}:00:00+08:00",
            "policy": {"zh": "用餐前2小时免费取消", "en": "Free cancellation 2 hours before dining"},
        },
        "reservation_hash": f"0x{uuid.uuid4().hex}",
    }


def _get_dietary_options(_p: Dict[str, Any], m: Optional[dict]) -> Dict[str, Any]:
    sf = _sf(m)
    has_veg = bool(sf.get("vegetarian_options"))
    cuisine = (sf.get("cuisine_type") or "").lower()

    supported = ["gluten_free"] if "dim sum" not in cuisine else []
    partially = []
    not_supported = ["halal", "kosher"]

    if has_veg:
        supported.append("vegetarian")
        partially.append("vegan")
    else:
        not_supported.insert(0, "vegetarian")

    if "seafood" not in cuisine and "shellfish" not in cuisine:
        supported.append("shellfish_free")

    details: Dict[str, Any] = {}
    if has_veg:
        details["vegetarian"] = {
            "available_items_count": 8,
            "description": {"zh": "提供多款素菜", "en": "Multiple vegetarian options available"},
        }
        details["vegan"] = {
            "available_items_count": 3,
            "description": {"zh": "部分素菜可调整为纯素，请提前告知", "en": "Some dishes can be made vegan with advance notice"},
        }

    return {
        "merchant": _name(m, "餐厅", "Restaurant"),
        "supported": supported,
        "partially_supported": partially,
        "not_supported": not_supported,
        "details": details,
        "allergen_handling": {
            "zh": "请在预订时说明过敏情况，厨房可针对性调整",
            "en": "Mention allergies when booking; kitchen can adjust accordingly",
        },
    }


# ─── Attraction Skills ────────────────────────────────────────────────

def _check_ticket_inventory(p: Dict[str, Any], m: Optional[dict]) -> Dict[str, Any]:
    date = p.get("date", _today(2))
    name = _name(m, "景点", "Attraction")
    sf = _sf(m)
    free_entry = bool(sf.get("free_entry"))
    base_price = int(sf.get("ticket_price") or 60)
    tags = _tags(m)

    if free_entry:
        return {
            "attraction_name": name,
            "date": date,
            "free_entry": True,
            "tickets": [],
            "note": {
                "zh": "本景点免费开放，无需购票",
                "en": "Free entry — no ticket required",
            },
            "peak_warning": {
                "is_peak": True,
                "reason": {"zh": "免费景点周末人流大", "en": "Free attraction — expect crowds on weekends"},
            },
        }

    tickets: List[Dict[str, Any]] = [{
        "type": "adult",
        "name": {"zh": "成人票", "en": "Adult Ticket"},
        "price": {"amount": base_price, "currency": "CNY"},
        "available": True,
        "remaining": 850,
        "time_slots": [
            {"slot": "08:00-10:00", "remaining": 200},
            {"slot": "10:00-12:00", "remaining": 150},
            {"slot": "12:00-14:00", "remaining": 300},
            {"slot": "14:00-16:00", "remaining": 200},
        ],
    }, {
        "type": "student",
        "name": {"zh": "学生票", "en": "Student Ticket"},
        "price": {"amount": max(20, base_price // 2), "currency": "CNY"},
        "available": True,
        "remaining": 200,
        "requires_id": True,
        "id_note": {"zh": "入园需出示学生证", "en": "Student ID required at entry"},
    }]

    # Add cable car / other extras if present in specific_fields
    cable_car = sf.get("cable_car")
    if cable_car:
        tickets.append({
            "type": "cable_car",
            "name": {"zh": "缆车票", "en": "Cable Car"},
            "price": {"amount": int(cable_car), "currency": "CNY"},
            "available": True,
            "remaining": 150,
        })
    boat = sf.get("boat_ride") or sf.get("boat_ticket")
    if boat:
        tickets.append({
            "type": "boat",
            "name": {"zh": "游船票", "en": "Boat Ride"},
            "price": {"amount": int(boat), "currency": "CNY"},
            "available": True,
            "remaining": 100,
        })

    weekend_peak = "UNESCO" in tags or "iconic" in tags or sf.get("daily_limit")
    return {
        "attraction_name": name,
        "merchant_did": (m or {}).get("did"),
        "date": date,
        "tickets": tickets,
        "peak_warning": {
            "is_peak": bool(weekend_peak),
            "reason": {
                "zh": "热门景点，建议上午早场入园" if weekend_peak else "正常客流",
                "en": "Popular attraction — morning slots recommended" if weekend_peak else "Normal traffic",
            },
        },
        "daily_limit": sf.get("daily_limit"),
    }


def _get_opening_hours(p: Dict[str, Any], m: Optional[dict]) -> Dict[str, Any]:
    date = p.get("date", _today())
    raw_hours = (m or {}).get("opening_hours") or "08:00-17:30"
    return {
        "merchant": _name(m, "景点", "Attraction"),
        "raw_schedule": raw_hours,
        "specific_date": {
            "date": date,
            "schedule": raw_hours,
            "is_open": True,
            "special_note": None,
        },
        "estimated_visit_duration": {
            "quick": {"minutes": 60, "zh": "快速游览", "en": "Quick tour"},
            "standard": {"minutes": 120, "zh": "常规游览", "en": "Standard visit"},
            "thorough": {"minutes": 180, "zh": "深度游览", "en": "In-depth tour"},
        },
    }


def _purchase_ticket(p: Dict[str, Any], m: Optional[dict]) -> Dict[str, Any]:
    order_id = f"TK-{uuid.uuid4().hex[:8].upper()}"
    sf = _sf(m)
    base_price = int(sf.get("ticket_price") or 60)
    student_price = max(20, base_price // 2)

    tickets_in = p.get("tickets") or [{"type": "adult", "quantity": 1}]
    line_items = []
    total = 0
    for t in tickets_in:
        ttype = t.get("type", "adult")
        qty = int(t.get("quantity", 1))
        unit = base_price if ttype == "adult" else (student_price if ttype == "student" else int(sf.get("cable_car") or base_price))
        subtotal = unit * qty
        total += subtotal
        line_items.append({"type": ttype, "quantity": qty, "unit_price": unit, "subtotal": subtotal})

    return {
        "merchant": _name(m, "景点", "Attraction"),
        "merchant_did": (m or {}).get("did"),
        "order_id": order_id,
        "status": "pending_payment",
        "tickets": line_items,
        "total": {"amount": total, "currency": "CNY"},
        "payment_url": f"https://tickets.tourskill.local/pay/{order_id}",
        "payment_deadline": _now_iso(offset_hours=1),
        "entry_method": {
            "zh": "凭身份证原件或订单二维码入园",
            "en": "Enter with original ID or order QR code",
        },
        "refund_policy": {
            "zh": "未使用门票可在有效期前24小时申请全额退款",
            "en": "Full refund available 24h before validity",
        },
        "order_hash": f"0x{uuid.uuid4().hex}",
    }


def _get_visitor_guide(_p: Dict[str, Any], m: Optional[dict]) -> Dict[str, Any]:
    name = _name(m, "景点", "Attraction")
    address = ((m or {}).get("location") or {}).get("address", "")
    tags = _tags(m)
    sf = _sf(m)

    tips: List[Dict[str, str]] = [
        {"zh": "建议提前在线购票，避免现场排队", "en": "Book tickets online in advance to avoid queues"},
    ]
    if "UNESCO" in tags:
        tips.append({"zh": "UNESCO 世界遗产，建议预留 2-3 小时深度游览", "en": "UNESCO World Heritage — allow 2-3 hours for a thorough visit"})
    if "Buddhist temple" in tags or "temple" in str(tags).lower():
        tips.append({"zh": "寺庙内请保持安静，部分区域不可拍照", "en": "Maintain silence inside the temple; photography restricted in some areas"})
    if sf.get("daily_limit"):
        tips.append({"zh": f"每日限流 {sf['daily_limit']} 人，务必提前预约", "en": f"Daily limit {sf['daily_limit']} visitors — advance reservation required"})

    return {
        "merchant": name,
        "address": address,
        "transport": {
            "general": {
                "zh": f"前往 {name['zh']}：{address}。建议使用地图 App 导航或乘出租车",
                "en": f"Getting to {name['en']}: {address}. Use a maps app or take a taxi.",
            },
        },
        "accessibility": {
            "wheelchair_accessible": "wheelchair" in str(tags).lower() or sf.get("wheelchair_accessible", True),
            "stroller_friendly": True,
        },
        "tips": tips,
    }


SKILL_HANDLERS: Dict[str, Any] = {
    # Hotel
    "check_availability": _check_availability,
    "get_rates": _get_rates,
    "create_booking": _create_booking,
    "get_cancellation_policy": _get_cancellation_policy,
    # Restaurant
    "check_table_availability": _check_table_availability,
    "get_menu": _get_menu,
    "reserve_table": _reserve_table,
    "get_dietary_options": _get_dietary_options,
    # Attraction
    "check_ticket_inventory": _check_ticket_inventory,
    "get_opening_hours": _get_opening_hours,
    "purchase_ticket": _purchase_ticket,
    "get_visitor_guide": _get_visitor_guide,
}
