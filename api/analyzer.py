import json
import anthropic

_client = anthropic.Anthropic()

_BASE_SYSTEM = """\
You are an expert meeting intelligence system for a credit union. Your job is to read \
a meeting transcript and extract structured information accurately and concisely.

EXTRACTION RULES
- executive_summary: Write 3–5 sentences covering the purpose, main outcomes, and \
  any unresolved issues. Be specific; do not pad with filler.
- key_decisions: A decision is a conclusion the group reached or ratified — not a \
  topic merely discussed. Include only things that were agreed upon. For decided_by, \
  provide the speaker's name if discernible; otherwise null.
- action_items: An action item is a concrete task assigned to a person or role. \
  Extract the owner by name if mentioned near the task. For due_date, use ISO-8601 \
  (YYYY-MM-DD) if a date was stated; otherwise null. Assign priority by urgency \
  language: "immediately/urgent/critical/ASAP" → high; "by end of week/soon/shortly" \
  → medium; no explicit urgency → low.
- topics_discussed: Short noun phrases listing every distinct subject covered, \
  whether or not a decision was reached.
- attendees_mentioned: Names of individuals mentioned by name in the transcript \
  (speakers and third parties). Do not infer unnamed roles.
- sentiment: Choose exactly one:
    productive — meeting advanced goals, collaborative tone, concrete outcomes.
    contentious — notable disagreement, tension, or unresolved conflict.
    routine — status updates only, no significant decisions or conflict.
- follow_up_meeting_suggested: true only if someone explicitly proposed scheduling \
  another meeting; false otherwise.

OUTPUT FORMAT
Respond with valid JSON only. No prose before or after the JSON object. \
Adhere exactly to the provided schema.\
"""

_TYPE_GUIDANCE: dict[str, str] = {
    "board": """\
BOARD MEETING FOCUS
Pay special attention to:
- Motions made, seconded, and their vote outcomes (unanimous / split / tabled).
- Regulatory or compliance disclosures.
- Approval of financial statements, budgets, or large expenditures.
- Executive performance or strategic direction changes.
Capture formal motions as key_decisions with the exact wording if possible.\
""",

    "alm_committee": """\
ALM (Asset/Liability Management) COMMITTEE FOCUS
Pay special attention to:
- Interest rate decisions: any rate changes approved, proposed, or rejected \
  (loans, deposits, certificates, money market).
- Net interest margin (NIM) analysis and projections discussed.
- Liquidity ratio targets and current standings.
- Investment portfolio adjustments or rebalancing decisions.
- Repricing risk and gap analysis conclusions.
- ALCO policy exceptions or limit breaches.
Capture every rate decision as a key_decision with the specific rate and product mentioned.\
""",

    "loan_committee": """\
LOAN COMMITTEE FOCUS
Pay special attention to:
- Loan approvals, denials, or conditional approvals (include member/borrower \
  identifier if stated, amounts, and loan purpose).
- Policy exceptions granted or denied.
- Credit quality trends or concentrations discussed.
- Troubled loan updates (TDRs, delinquencies, charge-offs).
- Underwriting guideline changes proposed or approved.
Capture each loan decision (approve/deny/condition) as a key_decision.\
""",

    "department_standup": """\
DEPARTMENT STANDUP FOCUS
This is a short operational meeting. Extract:
- Blockers or impediments raised and whether they were resolved in the meeting.
- Metrics or KPIs reported (include the numbers if stated).
- Handoffs or dependencies between team members.
Keep executive_summary tight (2–3 sentences). Action items are the primary output \
of standups; capture all of them.\
""",

    "other": """\
GENERAL MEETING FOCUS
Extract all fields as completely as possible. If the meeting type is ambiguous, \
infer from the content and note it briefly in executive_summary.\
""",
}

_OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "executive_summary": {"type": "string"},
        "key_decisions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "decision": {"type": "string"},
                    "context": {"type": "string"},
                    "decided_by": {"type": ["string", "null"]},
                },
                "required": ["decision", "context", "decided_by"],
                "additionalProperties": False,
            },
        },
        "action_items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "task": {"type": "string"},
                    "owner": {"type": ["string", "null"]},
                    "due_date": {"type": ["string", "null"]},
                    "priority": {"type": "string", "enum": ["high", "medium", "low"]},
                },
                "required": ["task", "owner", "due_date", "priority"],
                "additionalProperties": False,
            },
        },
        "topics_discussed": {"type": "array", "items": {"type": "string"}},
        "attendees_mentioned": {"type": "array", "items": {"type": "string"}},
        "sentiment": {
            "type": "string",
            "enum": ["productive", "contentious", "routine"],
        },
        "follow_up_meeting_suggested": {"type": "boolean"},
    },
    "required": [
        "executive_summary",
        "key_decisions",
        "action_items",
        "topics_discussed",
        "attendees_mentioned",
        "sentiment",
        "follow_up_meeting_suggested",
    ],
    "additionalProperties": False,
}


def analyze_meeting(transcript: str, meeting_type: str) -> dict:
    type_guidance = _TYPE_GUIDANCE.get(meeting_type, _TYPE_GUIDANCE["other"])

    with _client.messages.stream(
        model="claude-opus-4-7",
        max_tokens=4096,
        thinking={"type": "adaptive"},
        system=[
            # Stable base — cached across repeated calls.
            {
                "type": "text",
                "text": _BASE_SYSTEM,
                "cache_control": {"type": "ephemeral"},
            },
            # Meeting-type-specific guidance — not cached (varies per call).
            {
                "type": "text",
                "text": type_guidance,
            },
        ],
        output_config={
            "format": {
                "type": "json_schema",
                "schema": _OUTPUT_SCHEMA,
            }
        },
        messages=[
            {
                "role": "user",
                "content": f"Meeting type: {meeting_type}\n\nTranscript:\n{transcript}",
            }
        ],
    ) as stream:
        message = stream.get_final_message()

    text = next(b.text for b in message.content if b.type == "text")
    return json.loads(text)
