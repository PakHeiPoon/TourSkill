"""Seed the merchants table with realistic mock data for demo purposes."""
import hashlib
import json
import uuid
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.db.supabase_client import get_supabase_client

WALLET = "0x56b0666c4fe6F3BA5572aC7AC99AF7Ede58b67b4"


def profile_hash(data: dict) -> str:
    canonical = json.dumps(data, sort_keys=True, ensure_ascii=False)
    return "0x" + hashlib.sha256(canonical.encode()).hexdigest()


def mid() -> str:
    return f"merchant:{uuid.uuid4().hex[:12]}"


# ─── Restaurants ──────────────────────────────────────────────────
RESTAURANTS = [
    {
        "name": "Grandma's Kitchen",
        "name_zh": "外婆家",
        "desc": "Popular Hangzhou chain known for affordable home-style Zhejiang dishes. Famous for steamed pork belly and tofu soup. Always packed — arrive early.",
        "city": "hangzhou",
        "address": "No. 3 Hubin Road, West Lake District, Hangzhou",
        "lat": 30.2590, "lng": 120.1560,
        "phone": "+86-571-87068888", "email": "info@grandmaskitchen.cn",
        "hours": "10:30-14:00, 16:30-21:00",
        "website": "https://www.grandmaskitchen.cn",
        "price_level": 2,
        "tags": ["Zhejiang cuisine", "home-style", "affordable", "family-friendly"],
        "skills": ["get_menu", "reserve_table", "check_table_availability"],
        "specific": {"cuisine_type": "Home-style Zhejiang", "avg_spend": 65, "vegetarian_options": True},
    },
    {
        "name": "Green Tea Restaurant",
        "name_zh": "绿茶餐厅",
        "desc": "Trendy Hangzhou restaurant blending traditional Zhejiang flavors with modern presentation. Known for Green Tea Roast Chicken and bread pudding dessert.",
        "city": "hangzhou",
        "address": "No. 83 Longjing Road, West Lake District, Hangzhou",
        "lat": 30.2380, "lng": 120.1280,
        "phone": "+86-571-87888022", "email": "reservation@greentea.cn",
        "hours": "10:00-22:00",
        "website": "https://www.greentearestaurant.cn",
        "price_level": 2,
        "tags": ["fusion", "trendy", "Zhejiang", "modern"],
        "skills": ["get_menu", "reserve_table", "check_table_availability", "get_dietary_options"],
        "specific": {"cuisine_type": "Modern Zhejiang", "avg_spend": 80, "signature_dishes": ["Green Tea Roast Chicken", "Bread Pudding"]},
    },
    {
        "name": "Zhi Wei Guan",
        "name_zh": "知味观",
        "desc": "Century-old dim sum institution since 1913. Renowned for xiaolongbao, cat-ear noodles, and traditional Hangzhou pastries. A must-visit for breakfast.",
        "city": "hangzhou",
        "address": "No. 83 Renhe Road, Shangcheng District, Hangzhou",
        "lat": 30.2490, "lng": 120.1670,
        "phone": "+86-571-87065921", "email": "contact@zhiweiguan.com",
        "hours": "06:30-21:30",
        "website": "https://www.zhiweiguan.com",
        "price_level": 2,
        "tags": ["dim sum", "breakfast", "traditional", "pastry", "xiaolongbao"],
        "skills": ["get_menu", "check_table_availability"],
        "specific": {"cuisine_type": "Hangzhou Dim Sum", "avg_spend": 50, "signature_dishes": ["Xiaolongbao", "Cat Ear Noodles", "Osmanthus Cake"]},
    },
    {
        "name": "Hai Di Lao Hot Pot",
        "name_zh": "海底捞火锅",
        "desc": "World-famous hot pot chain with legendary service. Customizable broths, fresh ingredients, and free manicures while you wait. Open late.",
        "city": "shanghai",
        "address": "No. 138 Huaihai Middle Road, Huangpu District, Shanghai",
        "lat": 31.2270, "lng": 121.4690,
        "phone": "+86-21-63556777", "email": "shanghai@haidilao.com",
        "hours": "10:00-03:00",
        "website": "https://www.haidilao.com",
        "price_level": 3,
        "tags": ["hot pot", "Sichuan", "late-night", "service"],
        "skills": ["get_menu", "reserve_table", "check_table_availability"],
        "specific": {"cuisine_type": "Sichuan Hot Pot", "avg_spend": 150, "vegetarian_options": True},
    },
    {
        "name": "Ultraviolet by Paul Pairet",
        "name_zh": "紫外线餐厅",
        "desc": "Shanghai's only 3-Michelin-star experience. 10-seat immersive dining with synchronized projections, scents, and music. 20-course tasting menu.",
        "city": "shanghai",
        "address": "Secret location revealed upon booking, Shanghai",
        "lat": 31.2350, "lng": 121.4850,
        "phone": "+86-21-63236506", "email": "uv@uvbypp.cc",
        "hours": "19:00-23:00 (dinner only, Tue-Sat)",
        "website": "https://uvbypp.cc",
        "price_level": 5,
        "tags": ["Michelin 3-star", "fine dining", "immersive", "French-Asian"],
        "skills": ["get_menu", "reserve_table"],
        "specific": {"cuisine_type": "French-Asian Avant-garde", "avg_spend": 6000, "michelin_stars": 3, "seats": 10},
    },
    {
        "name": "Nan Xiang Steamed Bun Restaurant",
        "name_zh": "南翔馒头店",
        "desc": "Iconic 1900s soup dumpling shop in Yu Garden. The original xiaolongbao with crab roe filling. Queue can be long but worth it.",
        "city": "shanghai",
        "address": "No. 85 Yuyuan Road, Huangpu District, Shanghai",
        "lat": 31.2270, "lng": 121.4920,
        "phone": "+86-21-63554206", "email": "info@nanxiangbun.com",
        "hours": "09:00-21:00",
        "price_level": 1,
        "tags": ["xiaolongbao", "soup dumplings", "historic", "Yu Garden"],
        "skills": ["get_menu", "check_table_availability"],
        "specific": {"cuisine_type": "Shanghai Dim Sum", "avg_spend": 40, "signature_dishes": ["Crab Roe Xiaolongbao", "Pork Xiaolongbao"]},
    },
    {
        "name": "Song He Lou",
        "name_zh": "松鹤楼",
        "desc": "Legendary Suzhou restaurant since 1757. Famous for Squirrel-Shaped Mandarin Fish and classic Su-style cuisine. Garden dining available.",
        "city": "suzhou",
        "address": "No. 18 Guanqian Street, Gusu District, Suzhou",
        "lat": 31.3100, "lng": 120.6290,
        "phone": "+86-512-67275285", "email": "info@songhelou.com",
        "hours": "11:00-13:30, 17:00-20:30",
        "website": "https://www.songhelou.com",
        "price_level": 3,
        "tags": ["Suzhou cuisine", "historic", "Mandarin Fish", "garden dining"],
        "skills": ["get_menu", "reserve_table", "check_table_availability", "get_dietary_options"],
        "specific": {"cuisine_type": "Su-style", "avg_spend": 180, "signature_dishes": ["Squirrel-Shaped Mandarin Fish", "Braised Tofu"]},
    },
    {
        "name": "Quanjude Roast Duck",
        "name_zh": "全聚德烤鸭店",
        "desc": "Beijing's most famous roast duck since 1864. Hung oven technique producing crispy skin and tender meat. Carved tableside by master chefs.",
        "city": "beijing",
        "address": "No. 30 Qianmen Street, Dongcheng District, Beijing",
        "lat": 39.8990, "lng": 116.3970,
        "phone": "+86-10-67011379", "email": "qianmen@quanjude.com.cn",
        "hours": "11:00-14:00, 17:00-21:00",
        "website": "https://www.quanjude.com.cn",
        "price_level": 3,
        "tags": ["Peking duck", "historic", "Beijing cuisine", "iconic"],
        "skills": ["get_menu", "reserve_table", "check_table_availability"],
        "specific": {"cuisine_type": "Beijing Imperial", "avg_spend": 200, "signature_dishes": ["Peking Duck", "Duck Soup"]},
    },
    {
        "name": "Da Dong Roast Duck",
        "name_zh": "大董烤鸭店",
        "desc": "Modern interpretation of Peking duck with 'lean' roasting technique. Artistic plating meets traditional flavors. Popular with food critics.",
        "city": "beijing",
        "address": "No. 3 Tuanjiehu Beikou, Chaoyang District, Beijing",
        "lat": 39.9340, "lng": 116.4610,
        "phone": "+86-10-65822892", "email": "info@dadongduck.com",
        "hours": "11:00-22:00",
        "website": "https://www.dadongduck.com",
        "price_level": 4,
        "tags": ["Peking duck", "modern", "artistic", "fine dining"],
        "skills": ["get_menu", "reserve_table", "check_table_availability", "get_dietary_options"],
        "specific": {"cuisine_type": "Modern Beijing", "avg_spend": 300, "signature_dishes": ["Lean Peking Duck", "Artistic Appetizers"]},
    },
]

# ─── Hotels ───────────────────────────────────────────────────────
HOTELS = [
    {
        "name": "Amanfayun",
        "name_zh": "安缦法云",
        "desc": "Ultra-luxury retreat nestled in a restored Tang dynasty village near Lingyin Temple. Tea plantations, meditation, and privacy. One of the world's best hotels.",
        "city": "hangzhou",
        "address": "No. 22 Fayun Lane, West Lake District, Hangzhou",
        "lat": 30.2350, "lng": 120.1050,
        "phone": "+86-571-87329999", "email": "amanfayun@aman.com",
        "hours": "24h reception",
        "website": "https://www.aman.com/resorts/amanfayun",
        "price_level": 5,
        "tags": ["luxury", "boutique", "temple", "tea plantation", "Aman"],
        "skills": ["check_availability", "get_rates", "create_booking", "get_cancellation_policy"],
        "specific": {"star_rating": 5, "rooms": 47, "style": "Restored Tang Village", "pool": False, "spa": True},
    },
    {
        "name": "Four Seasons Hotel Hangzhou",
        "name_zh": "杭州四季酒店",
        "desc": "Lakeside luxury on West Lake's western shore. Traditional Chinese garden design with modern Five-star amenities. Private boat dock.",
        "city": "hangzhou",
        "address": "No. 5 Lingyin Road, West Lake District, Hangzhou",
        "lat": 30.2400, "lng": 120.1180,
        "phone": "+86-571-81138888", "email": "hangzhou@fourseasons.com",
        "hours": "24h reception",
        "website": "https://www.fourseasons.com/hangzhou",
        "price_level": 5,
        "tags": ["luxury", "lakeside", "garden", "Five-star"],
        "skills": ["check_availability", "get_rates", "create_booking", "get_cancellation_policy"],
        "specific": {"star_rating": 5, "rooms": 81, "pool": True, "spa": True, "boat_dock": True},
    },
    {
        "name": "Hangzhou Youzi Youth Hostel",
        "name_zh": "杭州柚子青年旅舍",
        "desc": "Cozy hostel near West Lake with rooftop terrace. Great for budget travelers and solo backpackers. Free walking tours on weekends.",
        "city": "hangzhou",
        "address": "No. 15 Nanshan Road, Shangcheng District, Hangzhou",
        "lat": 30.2450, "lng": 120.1580,
        "phone": "+86-571-87889966", "email": "book@youzihotel.com",
        "hours": "24h reception",
        "price_level": 1,
        "tags": ["budget", "hostel", "backpacker", "rooftop", "West Lake"],
        "skills": ["check_availability", "get_rates", "create_booking"],
        "specific": {"star_rating": 2, "rooms": 30, "dorms": True, "free_wifi": True, "shared_kitchen": True},
    },
    {
        "name": "The Peninsula Shanghai",
        "name_zh": "上海半岛酒店",
        "desc": "Art Deco masterpiece on the Bund with sweeping Huangpu River views. Rolls-Royce fleet, rooftop helipad, and legendary afternoon tea.",
        "city": "shanghai",
        "address": "No. 32 The Bund, Zhongshan Dong Yi Road, Shanghai",
        "lat": 31.2440, "lng": 121.4900,
        "phone": "+86-21-23272888", "email": "psh@peninsula.com",
        "hours": "24h reception",
        "website": "https://www.peninsula.com/shanghai",
        "price_level": 5,
        "tags": ["luxury", "Bund", "Art Deco", "river view", "Peninsula"],
        "skills": ["check_availability", "get_rates", "create_booking", "get_cancellation_policy"],
        "specific": {"star_rating": 5, "rooms": 235, "pool": True, "spa": True, "helipad": True},
    },
    {
        "name": "URBN Hotel Shanghai",
        "name_zh": "雅悦酒店",
        "desc": "China's first carbon-neutral boutique hotel. Recycled materials, organic dining, and zen garden. In the heart of Jing'an.",
        "city": "shanghai",
        "address": "No. 183 Jiaozhou Road, Jing'an District, Shanghai",
        "lat": 31.2290, "lng": 121.4450,
        "phone": "+86-21-51530088", "email": "info@urbnhotels.com",
        "hours": "24h reception",
        "website": "https://www.urbnhotels.com",
        "price_level": 3,
        "tags": ["boutique", "eco-friendly", "carbon-neutral", "zen"],
        "skills": ["check_availability", "get_rates", "create_booking"],
        "specific": {"star_rating": 4, "rooms": 26, "eco_certified": True, "organic_dining": True},
    },
    {
        "name": "Suzhou Pan Pacific",
        "name_zh": "苏州泛太平洋酒店",
        "desc": "Modern hotel overlooking Jinji Lake in Suzhou Industrial Park. Connected to shopping mall. Indoor pool with lake views.",
        "city": "suzhou",
        "address": "No. 259 Xinggang Street, Suzhou Industrial Park, Suzhou",
        "lat": 31.3130, "lng": 120.7160,
        "phone": "+86-512-62298888", "email": "suzhou@panpacific.com",
        "hours": "24h reception",
        "website": "https://www.panpacific.com/suzhou",
        "price_level": 3,
        "tags": ["lakeside", "business", "modern", "connected"],
        "skills": ["check_availability", "get_rates", "create_booking", "get_cancellation_policy"],
        "specific": {"star_rating": 5, "rooms": 481, "pool": True, "spa": True, "lake_view": True},
    },
    {
        "name": "Aman Summer Palace Beijing",
        "name_zh": "颐和安缦",
        "desc": "Adjacent to the Summer Palace in restored imperial-era dwellings. 100-year-old courtyards with heated floors. The quintessential Beijing luxury escape.",
        "city": "beijing",
        "address": "No. 1 Gongmenqian Street, Summer Palace, Beijing",
        "lat": 39.9990, "lng": 116.2750,
        "phone": "+86-10-59879999", "email": "amansummerpalace@aman.com",
        "hours": "24h reception",
        "website": "https://www.aman.com/resorts/aman-summer-palace",
        "price_level": 5,
        "tags": ["luxury", "imperial", "courtyard", "Summer Palace", "Aman"],
        "skills": ["check_availability", "get_rates", "create_booking", "get_cancellation_policy"],
        "specific": {"star_rating": 5, "rooms": 51, "pool": True, "spa": True, "style": "Imperial Courtyard"},
    },
    {
        "name": "Beijing 161 Lama Temple Hostel",
        "name_zh": "北京161雍和宫店",
        "desc": "Charming hutong hostel near Lama Temple. Traditional courtyard with modern comforts. Free hutong bike tours and dumpling-making classes.",
        "city": "beijing",
        "address": "No. 161 Jiaodaokou Nandajie, Dongcheng District, Beijing",
        "lat": 39.9440, "lng": 116.4120,
        "phone": "+86-10-84020277", "email": "lama@161hostel.com",
        "hours": "24h reception",
        "price_level": 1,
        "tags": ["hutong", "hostel", "budget", "cultural", "Lama Temple"],
        "skills": ["check_availability", "get_rates", "create_booking"],
        "specific": {"star_rating": 2, "rooms": 20, "dorms": True, "courtyard": True, "bike_rental": True},
    },
    {
        "name": "Tonino Lamborghini Hotel Suzhou",
        "name_zh": "苏州兰博基尼酒店",
        "desc": "Italian luxury hotel by the Lamborghini family in Kunshan. Supercar-themed suites, Italian restaurant, and private marina on Dianshan Lake.",
        "city": "suzhou",
        "address": "No. 8 Dongshanhu Road, Kunshan, Suzhou",
        "lat": 31.3550, "lng": 120.9800,
        "phone": "+86-512-57600888", "email": "reservation@lamborghinihotels.cn",
        "hours": "24h reception",
        "website": "https://www.lamborghinihotels.cn",
        "price_level": 4,
        "tags": ["luxury", "Italian", "supercar", "lakeside", "unique"],
        "skills": ["check_availability", "get_rates", "create_booking", "get_cancellation_policy"],
        "specific": {"star_rating": 5, "rooms": 200, "pool": True, "spa": True, "marina": True},
    },
]

# ─── Attractions ──────────────────────────────────────────────────
ATTRACTIONS = [
    {
        "name": "West Lake Scenic Area",
        "name_zh": "西湖风景区",
        "desc": "UNESCO World Heritage site and Hangzhou's crown jewel. 6.5 sq km lake with pagodas, gardens, causeways, and the legendary Leifeng Pagoda. Free entry to most areas.",
        "city": "hangzhou",
        "address": "West Lake, Hangzhou",
        "lat": 30.2420, "lng": 120.1480,
        "phone": "+86-571-87179539", "email": "info@westlake.gov.cn",
        "hours": "Open 24h (Leifeng Pagoda: 08:00-20:30)",
        "website": "https://www.westlake.gov.cn",
        "price_level": 1,
        "tags": ["UNESCO", "lake", "pagoda", "free entry", "scenic"],
        "skills": ["check_ticket_inventory", "get_opening_hours", "purchase_ticket", "get_visitor_guide"],
        "specific": {"area_sqkm": 6.5, "free_entry": True, "pagoda_ticket": 40, "boat_ride": 55},
    },
    {
        "name": "Lingyin Temple",
        "name_zh": "灵隐寺",
        "desc": "One of China's largest Buddhist temples founded in 328 AD. Ancient stone carvings, the Hall of the Great Hero, and peaceful bamboo groves.",
        "city": "hangzhou",
        "address": "No. 1 Fayun Lane, West Lake District, Hangzhou",
        "lat": 30.2370, "lng": 120.1040,
        "phone": "+86-571-87968665", "email": "info@lingyinsi.org",
        "hours": "07:00-18:15 (summer), 07:30-17:30 (winter)",
        "website": "https://www.lingyinsi.org",
        "price_level": 2,
        "tags": ["Buddhist temple", "historic", "stone carvings", "ancient"],
        "skills": ["check_ticket_inventory", "get_opening_hours", "purchase_ticket", "get_visitor_guide"],
        "specific": {"founded": "328 AD", "ticket_price": 75, "includes": "Feilai Peak + Temple"},
    },
    {
        "name": "Xixi National Wetland Park",
        "name_zh": "西溪国家湿地公园",
        "desc": "China's first national wetland park. Boat rides through reed marshes, bird watching, and traditional fishing villages. Filming location of Running Man China.",
        "city": "hangzhou",
        "address": "No. 518 Tianmushan Road, Xihu District, Hangzhou",
        "lat": 30.2700, "lng": 120.0670,
        "phone": "+86-571-88106688", "email": "info@xixiwetland.com",
        "hours": "08:00-17:30",
        "website": "https://www.xixiwetland.com",
        "price_level": 2,
        "tags": ["wetland", "nature", "boat ride", "birdwatching"],
        "skills": ["check_ticket_inventory", "get_opening_hours", "purchase_ticket", "get_visitor_guide"],
        "specific": {"area_sqkm": 11.5, "ticket_price": 80, "boat_ticket": 60},
    },
    {
        "name": "The Bund",
        "name_zh": "外滩",
        "desc": "Shanghai's iconic waterfront promenade with 52 heritage buildings spanning Art Deco, Beaux-Arts, and Gothic styles. Best viewed at night with Pudong skyline.",
        "city": "shanghai",
        "address": "Zhongshan Dong Yi Road, Huangpu District, Shanghai",
        "lat": 31.2400, "lng": 121.4900,
        "phone": "+86-21-63181188", "email": "info@thebund.sh.cn",
        "hours": "Open 24h (best at night)",
        "price_level": 1,
        "tags": ["waterfront", "nightscape", "heritage", "free", "iconic"],
        "skills": ["get_opening_hours", "get_visitor_guide"],
        "specific": {"free_entry": True, "heritage_buildings": 52, "best_time": "19:00-22:00"},
    },
    {
        "name": "Yu Garden",
        "name_zh": "豫园",
        "desc": "Classical Chinese garden dating to 1559, Ming Dynasty. Exquisite rockeries, dragon walls, and pavilions. Adjacent bazaar has great street food.",
        "city": "shanghai",
        "address": "No. 218 Anren Street, Huangpu District, Shanghai",
        "lat": 31.2270, "lng": 121.4920,
        "phone": "+86-21-63260830", "email": "info@yugarden.sh.cn",
        "hours": "08:30-17:00",
        "website": "https://www.yugarden.sh.cn",
        "price_level": 2,
        "tags": ["Ming Dynasty", "classical garden", "historic", "bazaar"],
        "skills": ["check_ticket_inventory", "get_opening_hours", "purchase_ticket", "get_visitor_guide"],
        "specific": {"founded": "1559", "ticket_price": 40, "area_sqm": 20000},
    },
    {
        "name": "Shanghai Disneyland",
        "name_zh": "上海迪士尼乐园",
        "desc": "The first Disney resort in mainland China. TRON Lightcycle Run, Pirates of the Caribbean, and the world's largest Disney castle.",
        "city": "shanghai",
        "address": "No. 360 Shendi West Road, Pudong, Shanghai",
        "lat": 31.1440, "lng": 121.6570,
        "phone": "+86-21-31580000", "email": "guest.services@shanghaidisneyresort.com",
        "hours": "08:30-20:30 (varies seasonally)",
        "website": "https://www.shanghaidisneyresort.com",
        "price_level": 4,
        "tags": ["theme park", "Disney", "family", "rides", "entertainment"],
        "skills": ["check_ticket_inventory", "get_opening_hours", "purchase_ticket", "get_visitor_guide"],
        "specific": {"ticket_price": 475, "fastpass": True, "rides": 40, "area_hectares": 390},
    },
    {
        "name": "Humble Administrator's Garden",
        "name_zh": "拙政园",
        "desc": "China's most famous classical garden and UNESCO World Heritage site. 500+ years of landscape art with lotus ponds, winding corridors, and bonsai gardens.",
        "city": "suzhou",
        "address": "No. 178 Dongbei Street, Gusu District, Suzhou",
        "lat": 31.3250, "lng": 120.6310,
        "phone": "+86-512-67546631", "email": "info@szzzy.cn",
        "hours": "07:30-17:30 (summer), 07:30-17:00 (winter)",
        "website": "https://www.szzzy.cn",
        "price_level": 2,
        "tags": ["UNESCO", "classical garden", "Ming Dynasty", "bonsai"],
        "skills": ["check_ticket_inventory", "get_opening_hours", "purchase_ticket", "get_visitor_guide"],
        "specific": {"founded": "1509", "ticket_price": 70, "area_hectares": 5.2, "unesco_year": 1997},
    },
    {
        "name": "Tiger Hill",
        "name_zh": "虎丘",
        "desc": "Ancient hill with the 'Leaning Tower of China' — the 1000-year-old Yunyan Pagoda tilting 3 degrees. Legend says the tomb of King He Lu lies below.",
        "city": "suzhou",
        "address": "No. 8 Huqiu Hill Road, Gusu District, Suzhou",
        "lat": 31.3280, "lng": 120.5810,
        "phone": "+86-512-65510201", "email": "info@tigerhill.com",
        "hours": "07:30-18:00",
        "website": "https://www.tigerhill.com",
        "price_level": 2,
        "tags": ["pagoda", "leaning tower", "historic", "garden"],
        "skills": ["check_ticket_inventory", "get_opening_hours", "purchase_ticket", "get_visitor_guide"],
        "specific": {"ticket_price": 60, "pagoda_age": "1000+ years", "tilt_degrees": 3},
    },
    {
        "name": "The Great Wall at Mutianyu",
        "name_zh": "慕田峪长城",
        "desc": "Best-preserved section of the Great Wall near Beijing. Less crowded than Badaling, with cable car access and toboggan ride down. Stunning autumn foliage.",
        "city": "beijing",
        "address": "Mutianyu, Huairou District, Beijing",
        "lat": 40.4318, "lng": 116.5704,
        "phone": "+86-10-61626022", "email": "info@mutianyugreatwall.com",
        "hours": "07:30-18:00 (summer), 08:00-17:00 (winter)",
        "website": "https://www.mutianyugreatwall.com",
        "price_level": 2,
        "tags": ["Great Wall", "UNESCO", "hiking", "cable car", "historic"],
        "skills": ["check_ticket_inventory", "get_opening_hours", "purchase_ticket", "get_visitor_guide"],
        "specific": {"ticket_price": 40, "cable_car": 120, "toboggan": 100, "length_km": 5.4},
    },
    {
        "name": "Forbidden City (Palace Museum)",
        "name_zh": "故宫博物院",
        "desc": "The world's largest palace complex with 9,999 rooms. 600 years of imperial history, priceless art collections, and stunning architecture. Book tickets in advance.",
        "city": "beijing",
        "address": "No. 4 Jingshan Front Street, Dongcheng District, Beijing",
        "lat": 39.9163, "lng": 116.3972,
        "phone": "+86-10-85007421", "email": "info@dpm.org.cn",
        "hours": "08:30-17:00 (Tue-Sun, closed Mon)",
        "website": "https://www.dpm.org.cn",
        "price_level": 2,
        "tags": ["palace", "UNESCO", "imperial", "museum", "historic"],
        "skills": ["check_ticket_inventory", "get_opening_hours", "purchase_ticket", "get_visitor_guide"],
        "specific": {"ticket_price": 60, "rooms": 9999, "area_hectares": 72, "daily_limit": 30000},
    },
]


def build_row(m: dict, mtype: str) -> dict:
    merchant_id = mid()
    did = f"did:tourskill:{merchant_id}"
    ph = profile_hash({"merchant_id": merchant_id, "type": mtype, "name": m["name"], "city": m["city"]})
    return {
        "merchant_id": merchant_id,
        "did": did,
        "merchant_type": mtype,
        "name_en": m["name"],
        "name_zh": m.get("name_zh", m["name"]),
        "description_en": m["desc"],
        "description_zh": m["desc"],
        "city": m["city"],
        "country": "CN",
        "address": m["address"],
        "latitude": m.get("lat"),
        "longitude": m.get("lng"),
        "contact_phone": m["phone"],
        "contact_email": m["email"],
        "opening_hours": m["hours"],
        "website_url": m.get("website"),
        "price_level": m.get("price_level"),
        "tags": m.get("tags", []),
        "languages_supported": ["zh", "en"],
        "supported_skills": m["skills"],
        "specific_fields": m.get("specific", {}),
        "wallet_address": WALLET,
        "profile_hash": ph,
        "skill_endpoint": f"/v1/merchants/{merchant_id}",
        "status": "active",
    }


def main():
    client = get_supabase_client()

    rows = []
    for r in RESTAURANTS:
        rows.append(build_row(r, "restaurant"))
    for h in HOTELS:
        rows.append(build_row(h, "hotel"))
    for a in ATTRACTIONS:
        rows.append(build_row(a, "attraction"))

    print(f"Inserting {len(rows)} merchants...")
    print(f"  Restaurants: {len(RESTAURANTS)}")
    print(f"  Hotels:      {len(HOTELS)}")
    print(f"  Attractions: {len(ATTRACTIONS)}")

    # Insert in batches
    batch_size = 10
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        result = client.table("merchants").insert(batch).execute()
        print(f"  Batch {i // batch_size + 1}: inserted {len(result.data)} rows")

    print(f"\nDone! Total: {len(rows)} merchants across 4 cities.")

    # Verify counts
    for city in ["hangzhou", "shanghai", "suzhou", "beijing"]:
        res = client.table("merchants").select("merchant_id", count="exact").eq("city", city).execute()
        print(f"  {city}: {res.count} merchants")


if __name__ == "__main__":
    main()
