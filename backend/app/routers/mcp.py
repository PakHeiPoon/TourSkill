import json

from fastapi import APIRouter, Request

from app.schemas.merchant import DiscoverRequest
from app.services.merchant_service import discover_merchants, fetch_merchant_by_id
from app.services.skill_service import execute_skill

router = APIRouter()

MCP_TOOLS = [
    {
        "name": "discover_merchants",
        "description": "Search the TourSkill decentralized registry for tourism merchants (hotels, restaurants, attractions) by city, type, or keyword.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "city": {"type": "string", "description": "City name in lowercase (e.g. hangzhou, shanghai)"},
                "type": {"type": "string", "enum": ["hotel", "restaurant", "attraction", "shop"], "description": "Merchant category filter"},
                "keyword": {"type": "string", "description": "Free-text search in merchant names"},
            },
        },
    },
    {
        "name": "invoke_merchant_skill",
        "description": "Invoke a specific skill on a registered merchant (e.g. get_menu, check_availability, reserve_table, purchase_ticket). Returns structured data from the merchant's skill endpoint.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "did": {"type": "string", "description": "Merchant DID or merchant_id from discovery results"},
                "skill_name": {"type": "string", "description": "Skill to invoke (e.g. get_menu, check_availability, reserve_table, check_ticket_inventory)"},
                "skill_args": {"type": "object", "description": "Arguments to pass to the skill (varies by skill type)"},
            },
            "required": ["did", "skill_name"],
        },
    },
    {
        "name": "get_merchant_details",
        "description": "Get full profile details for a specific merchant by ID, including all supported skills, location, and contact information.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "merchant_id": {"type": "string", "description": "The merchant_id to look up"},
            },
            "required": ["merchant_id"],
        },
    },
]


@router.get("/tools/list")
def mcp_list_tools():
    return {"tools": MCP_TOOLS}


@router.post("/tools/execute")
async def mcp_execute_tool(request: Request):
    body = await request.json()
    tool_name = body.get("name")
    arguments = body.get("arguments", {})

    if tool_name == "discover_merchants":
        req = DiscoverRequest(**arguments)
        results = discover_merchants(req)
        return {"content": [{"type": "text", "text": json.dumps(results, ensure_ascii=False)}]}

    if tool_name == "invoke_merchant_skill":
        merchant_id = arguments.get("did")
        skill = arguments.get("skill_name")
        args = arguments.get("skill_args", {})
        if not merchant_id or not skill:
            return {"content": [{"type": "text", "text": "Error: did and skill_name are required"}], "isError": True}

        try:
            merchant = fetch_merchant_by_id(merchant_id)
        except Exception:
            return {"content": [{"type": "text", "text": f"Error: Merchant {merchant_id} not found"}], "isError": True}

        if skill not in merchant.get("skills", []):
            return {
                "content": [{"type": "text", "text": f"Error: Skill '{skill}' not supported by {merchant.get('name', {}).get('en', merchant_id)}. Available: {merchant.get('skills', [])}"}],
                "isError": True,
            }

        result = execute_skill(skill, args, merchant)
        return {"content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False, default=str)}]}

    if tool_name == "get_merchant_details":
        mid = arguments.get("merchant_id")
        if not mid:
            return {"content": [{"type": "text", "text": "Error: merchant_id is required"}], "isError": True}
        try:
            merchant = fetch_merchant_by_id(mid)
            return {"content": [{"type": "text", "text": json.dumps(merchant, ensure_ascii=False, default=str)}]}
        except Exception:
            return {"content": [{"type": "text", "text": f"Error: Merchant {mid} not found"}], "isError": True}

    return {"content": [{"type": "text", "text": f"Unknown tool: {tool_name}"}], "isError": True}
