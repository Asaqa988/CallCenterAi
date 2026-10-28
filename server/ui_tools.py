"""Tools that let the voice agent show things on the web page while it talks.

The tools run here, on the server, but what they change lives in the browser. They reach it
over the same connection the call uses: a tool sends a ``ui-command`` (see
``RTVIUICommandFrame``) and the page reacts by scrolling or highlighting. The page, in turn,
reports where the user is with a ``ui-state`` event, so a tool can tell "scroll them there"
from "it is already on their screen" without asking the model.

Two rules the whole file follows:

* The model never sees page structure. Tool descriptions say *when* to call a tool in the
  user's words; there are no routes, URLs or element ids in them. The names the page
  understands live only in the handlers below.
* Every tool returns a ``hint``: a short instruction for the model about what to say next.
  It depends on what the tool actually did, so the base prompt stays small.
"""

import asyncio
import json
import os
import time
from types import SimpleNamespace

from google import genai
from google.genai import types
from loguru import logger
from pipecat.adapters.llm.schemas.function_schema import FunctionSchema
from pipecat.processors.frameworks.rtvi import RTVIUICommandFrame
from pipecat.services.llm_service import FunctionCallParams

PACKAGES = ["small", "medium", "business"]
ADDONS = ["battery", "maintenance"]
PAYMENT_TOPICS = {"installments": "term-payment", "visit": "term-visit", "warranty": "term-warranty"}
FAQ_TOPICS = ["weather", "payback", "cleaning", "outside", "netmetering"]

# Said to the model after a tool ran. The model has usually already answered out loud before
# calling the tool (see UI_PROMPT in bot.py), so these steer the short follow-up and stop it
# repeating itself. `moved` is for when the user was taken somewhere else; `here` is for when
# the thing was already on their screen.
_UNANSWERED = " وإذا لسا ما جاوبته، جاوبه هلأ بجملة أو جملتين."
HINTS = {
    "prices": (
        "قسم الأسعار ظهر على الشاشة. لا تعيد كلامك؛ بس اسأله أي نظام بناسبه." + _UNANSWERED,
        "قسم الأسعار كان أصلاً على الشاشة، لا تقل إنك فتحته ولا تعيد كلامك؛ بس اسأله أي نظام بناسبه."
        + _UNANSWERED,
    ),
    "package": (
        "بطاقة النظام صارت قدامه ومميّزة. لا تعيد كلامك؛ زيد جملة وحدة عن شي ظاهر بالبطاقة."
        + _UNANSWERED,
        "بطاقة النظام كانت قريبة وميّزتها. لا تعيد كلامك؛ زيد جملة وحدة بس." + _UNANSWERED,
    ),
    "addon": (
        "البطاقة ظهرت على الشاشة. لا تعيد كلامك؛ زيد جملة وحدة عن الفايدة." + _UNANSWERED,
        "البطاقة كانت أصلاً على الشاشة وميّزتها. لا تعيد كلامك؛ زيد جملة وحدة بس." + _UNANSWERED,
    ),
    "payment": (
        "الشرط ظهر على الشاشة. لا تعيد كلامك؛ بس اسأله إذا بدو يعرف شي تاني." + _UNANSWERED,
        "الشرط كان أصلاً على الشاشة وميّزته. لا تعيد كلامك." + _UNANSWERED,
    ),
    "about": (
        "قسم من نحن ظهر على الشاشة. لا تعيد كلامك؛ اذكر سنة التأسيس والمقر بس." + _UNANSWERED,
        "قسم من نحن كان أصلاً على الشاشة. لا تعيد كلامك." + _UNANSWERED,
    ),
    "steps": (
        "خطوات العمل ظهرت على الشاشة. لا تعيد كلامك؛ بس قله يتابعها بعينه." + _UNANSWERED,
        "خطوات العمل كانت أصلاً على الشاشة. لا تعيد كلامك." + _UNANSWERED,
    ),
    "faq": (
        "السؤال انفتح على الشاشة. لا تعيد كلامك." + _UNANSWERED,
        "السؤال انفتح وكان قريب من نظره. لا تعيد كلامك." + _UNANSWERED,
    ),
    "contact": (
        "قسم التواصل ظهر على الشاشة. اذكر الهاتف والواتساب بس، والدوام إذا سأل." + _UNANSWERED,
        "قسم التواصل كان أصلاً على الشاشة. اذكر الهاتف والواتساب بس." + _UNANSWERED,
    ),
    "assistant": (
        "رجع لقسم المساعد. كمّل المحادثة عادي.",
        "هو أصلاً عند المساعد. كمّل المحادثة عادي.",
    ),
    "choose": (
        "نقلته لقسم الأسعار وميّزت النظام اللي اختاره، وجهّزت رسالة الواتساب باسمه. "
        "أكّد اختياره بجملة واقترح عليه يراسلهم على الواتساب.",
        "ميّزت النظام اللي اختاره وجهّزت رسالة الواتساب باسمه. "
        "أكّد اختياره بجملة واقترح عليه يراسلهم على الواتساب.",
    ),
}


def _schema(name, description, handler, props=None, required=None) -> FunctionSchema:
    return FunctionSchema(
        name=name,
        description=description,
        properties=props or {},
        required=required or [],
        handler=handler,
    )


def _enum(values, description) -> dict:
    return {"type": "string", "enum": values, "description": description}


class UIController:
    """Knows where the user is on the page and drives it. One per call."""

    def __init__(self) -> None:
        self.section = "hero"  # which section is on the user's screen
        self.lang = "ar"
        self.theme = "dark"
        self.selected_package: str | None = None
        self._worker = None

    def attach(self, worker) -> None:
        """Give the controller the pipeline worker it sends commands through."""
        self._worker = worker

    def update_from_client(self, payload: dict) -> None:
        """Apply a ``ui-state`` event from the page."""
        self.section = payload.get("section") or self.section
        self.lang = payload.get("lang") or self.lang
        self.theme = payload.get("theme") or self.theme
        self.selected_package = payload.get("selectedPackage")

    async def _send(self, command: str, payload: dict) -> None:
        if self._worker is None:
            logger.warning(f"UI command {command} dropped: no worker attached")
            return
        await self._worker.queue_frame(RTVIUICommandFrame(command=command, payload=payload))

    async def ensure_screen(
        self, section: str, item: str | None = None, spotlight: bool = False
    ) -> bool:
        """Put ``section`` (and ``item`` inside it) in front of the user.

        Scrolls there only when they are somewhere else; if the section is already on
        their screen it just highlights. Returns True when the user had to be moved.
        """
        moved = self.section != section
        await self._send(
            "show",
            {
                "mode": "navigate" if moved else "stay",
                "section": section,
                "item": item,
                "spotlight": spotlight,
            },
        )
        self.section = section
        return moved

    async def _show(
        self,
        params: FunctionCallParams,
        hint_key: str,
        section: str,
        item: str | None = None,
        spotlight: bool = False,
    ) -> None:
        moved = await self.ensure_screen(section, item, spotlight)
        moved_hint, here_hint = HINTS[hint_key]
        await params.result_callback({"ok": True, "hint": moved_hint if moved else here_hint})

    # -- display tools: they only change what the user sees --------------------------

    async def show_prices(self, params: FunctionCallParams):
        await self._show(params, "prices", "prices")

    async def show_package(self, params: FunctionCallParams):
        package = params.arguments.get("package")
        if package not in PACKAGES:
            await params.result_callback({"ok": False, "hint": "ما فهمت أي نظام بقصد، اسأله."})
            return
        await self._show(params, "package", "prices", f"pkg-{package}", spotlight=True)

    async def show_addon(self, params: FunctionCallParams):
        addon = params.arguments.get("addon")
        if addon not in ADDONS:
            await params.result_callback({"ok": False, "hint": "ما فهمت شو بقصد، اسأله."})
            return
        await self._show(params, "addon", "prices", f"addon-{addon}")

    async def show_payment_info(self, params: FunctionCallParams):
        item = PAYMENT_TOPICS.get(params.arguments.get("topic"))
        if item is None:
            await params.result_callback({"ok": False, "hint": "ما فهمت شو بقصد، اسأله."})
            return
        await self._show(params, "payment", "prices", item)

    async def show_about(self, params: FunctionCallParams):
        await self._show(params, "about", "about")

    async def show_how_it_works(self, params: FunctionCallParams):
        await self._show(params, "steps", "about", "steps")

    async def show_faq(self, params: FunctionCallParams):
        topic = params.arguments.get("topic")
        if topic not in FAQ_TOPICS:
            await params.result_callback({"ok": False, "hint": "ما فهمت شو بقصد، اسأله."})
            return
        await self._show(params, "faq", "about", f"faq-{topic}")

    async def show_contact(self, params: FunctionCallParams):
        await self._show(params, "contact", "contact")

    async def back_to_assistant(self, params: FunctionCallParams):
        await self._show(params, "assistant", "assistant")

    # -- tools that change state: the user must be looking at the effect --------------

    async def choose_package(self, params: FunctionCallParams):
        package = params.arguments.get("package")
        if package not in PACKAGES:
            await params.result_callback({"ok": False, "hint": "ما فهمت أي نظام اختار، اسأله."})
            return
        # The pick shows on the pricing cards, so get the user there first.
        moved = await self.ensure_screen("prices", f"pkg-{package}", spotlight=True)
        await self._send("select", {"package": package})
        self.selected_package = package
        moved_hint, here_hint = HINTS["choose"]
        await params.result_callback({"ok": True, "hint": moved_hint if moved else here_hint})

    async def change_language(self, params: FunctionCallParams):
        lang = params.arguments.get("lang")
        if lang not in ("ar", "en"):
            await params.result_callback({"ok": False, "hint": "ما فهمت أي لغة بقصد، اسأله."})
            return
        # The language switch is visible from anywhere on the page, so nobody needs moving.
        if lang == self.lang:
            await params.result_callback(
                {"ok": True, "hint": "الموقع أصلاً بهاي اللغة. قله هيك بجملة قصيرة."}
            )
            return
        await self._send("set-language", {"lang": lang})
        self.lang = lang
        await params.result_callback(
            {"ok": True, "hint": "تغيّرت لغة الموقع. كمّل المحادثة بلغة المستخدم."}
        )

    async def change_theme(self, params: FunctionCallParams):
        mode = params.arguments.get("mode")
        if mode not in ("light", "dark"):
            await params.result_callback({"ok": False, "hint": "ما فهمت أي مظهر بقصد، اسأله."})
            return
        if mode == self.theme:
            await params.result_callback(
                {"ok": True, "hint": "الموقع أصلاً بهاد المظهر. قله هيك بجملة قصيرة."}
            )
            return
        await self._send("set-theme", {"mode": mode})
        self.theme = mode
        await params.result_callback({"ok": True, "hint": "تغيّر مظهر الموقع."})

    # -- tool definitions -------------------------------------------------------------

    # The one argument each tool takes, so the router can call a tool by name and value.
    TOOL_ARGUMENT = {
        "show_package": "package",
        "show_addon": "addon",
        "show_payment_info": "topic",
        "show_faq": "topic",
        "choose_package": "package",
        "change_language": "lang",
        "change_theme": "mode",
    }

    def tools(self) -> list[FunctionSchema]:
        """The tools to advertise to the model. Descriptions say when to call, in the
        user's words, and never mention how the page is built."""
        return [
            _schema(
                "show_prices",
                "اعرض للمستخدم الأسعار والأنظمة المتوفرة على الشاشة. نادِها لما يسأل عن الأسعار "
                "أو التكلفة أو شو الأنظمة اللي عندكم أو كم بتكلّف الطاقة الشمسية بشكل عام.",
                self.show_prices,
            ),
            _schema(
                "show_package",
                "اعرض نظاماً معيّناً للمستخدم على الشاشة. نادِها لما يسأل أو يحكي عن نظام البيت "
                "الصغير أو المتوسط أو نظام المحلات والمزارع.",
                self.show_package,
                {
                    "package": _enum(
                        PACKAGES,
                        "small للبيت الصغير، medium للبيت المتوسط، business للمحلات والمزارع.",
                    )
                },
                ["package"],
            ),
            _schema(
                "show_addon",
                "اعرض البطاريات أو الصيانة على الشاشة. نادِها لما يسأل عن تخزين الكهربا "
                "بالبطاريات أو عن صيانة الألواح وتنظيفها.",
                self.show_addon,
                {"addon": _enum(ADDONS, "battery للبطاريات، maintenance للصيانة.")},
                ["addon"],
            ),
            _schema(
                "show_payment_info",
                "اعرض شروط الدفع أو الزيارة أو الضمان على الشاشة. نادِها لما يسأل عن التقسيط "
                "وطرق الدفع، أو عن زيارة المهندس ورسمها، أو عن الضمان.",
                self.show_payment_info,
                {
                    "topic": _enum(
                        list(PAYMENT_TOPICS),
                        "installments للتقسيط والدفع، visit لزيارة المهندس، warranty للضمان.",
                    )
                },
                ["topic"],
            ),
            _schema(
                "show_about",
                "اعرض معلومات الشركة على الشاشة. نادِها لما يسأل مين الشركة أو من وين أو من "
                "أمتى تأسست أو كم موظف عندها.",
                self.show_about,
            ),
            _schema(
                "show_how_it_works",
                "اعرض خطوات العمل على الشاشة. نادِها لما يسأل كيف بتشتغلوا، أو كم بياخد "
                "التركيب، أو شو بيصير بعد ما نتفق.",
                self.show_how_it_works,
            ),
            _schema(
                "show_faq",
                "اعرض جواب سؤال شائع على الشاشة. نادِها لما يكون سؤاله واحد من هالأسئلة.",
                self.show_faq,
                {
                    "topic": _enum(
                        FAQ_TOPICS,
                        "weather: الألواح بالشتا والغيم. payback: كم سنة لحد ما يرجّع فلوسه. "
                        "cleaning: تنظيف الألواح. outside: الشغل برّا عمّان. "
                        "netmetering: بيع الكهربا الزايدة.",
                    )
                },
                ["topic"],
            ),
            _schema(
                "show_contact",
                "اعرض معلومات التواصل على الشاشة. نادِها لما بدو يتواصل معكم أو يعرف الهاتف "
                "أو الواتساب أو العنوان أو أوقات الدوام.",
                self.show_contact,
            ),
            _schema(
                "back_to_assistant",
                "رجّع المستخدم لمكان المحادثة على الشاشة. نادِها لما يقول رجّعني أو بدي أرجع "
                "للمحادثة.",
                self.back_to_assistant,
            ),
            _schema(
                "choose_package",
                "سجّل النظام اللي اختاره المستخدم. نادِها بس لما يقول بوضوح إنه بدو هاد النظام "
                "أو قرر يختاره، مش لما يسأل عنه بس.",
                self.choose_package,
                {
                    "package": _enum(
                        PACKAGES,
                        "small للبيت الصغير، medium للبيت المتوسط، business للمحلات والمزارع.",
                    )
                },
                ["package"],
            ),
            _schema(
                "change_language",
                "غيّر لغة الموقع. نادِها لما يطلب الموقع بالعربي أو بالإنجليزي.",
                self.change_language,
                {"lang": _enum(["ar", "en"], "ar للعربي، en للإنجليزي.")},
                ["lang"],
            ),
            _schema(
                "change_theme",
                "غيّر مظهر الموقع. نادِها لما يطلب مظهر فاتح أو غامق.",
                self.change_theme,
                {"mode": _enum(["light", "dark"], "light للفاتح، dark للغامق.")},
                ["mode"],
            ),
        ]


# ---------------------------------------------------------------------------
# Router: drive the page without a second model round trip
# When the model calls a tool itself, it answers in two steps (call the tool, then speak),
# which adds about two seconds of silence. The router skips that: after each user turn a
# small background call to Gemini picks the matching tool, in parallel with the answer, and
# the same handlers above run. The spoken model then has no tools and answers in one step.
# The cost is that the model gets no `hint` back; it does not know the page moved.
# ---------------------------------------------------------------------------

ROUTE_PROMPT = """You decide which web-page action, if any, goes with what a customer just said to a
solar company's voice assistant. The page shows prices, about-us, FAQ and contact sections.
The action is shown on screen while the assistant answers out loud.

Actions (name(argument: values): when to use it):
{catalogue}

Rules:
- Pick the single action that best matches what the customer asks about or talks about.
- Pick "none" for greetings, thanks, small talk, or anything that has no matching action.
- choose_package only when the customer clearly decides to take that system, not when they only ask.
- change_language and change_theme only when the customer explicitly asks for it.
- Judge only the current customer message. Use the recent conversation just to resolve words like
  "it" or "that one"; never repeat an earlier action for a fragment or an unclear message ("none").
- value: the argument value, or an empty string when the action takes none.

Page state: section={section}, language={lang}, theme={theme}

=== recent conversation ===
{history}"""


class UIRouter:
    """Picks a page action for each finished user turn, in the background."""

    def __init__(self, ui: UIController, api_key: str | None) -> None:
        self._ui = ui
        self._client = genai.Client(api_key=api_key)
        # A small model on purpose: the page should move before the answer starts, and the
        # full-size model takes about 2.5s even for this.
        self._model = os.getenv("GOOGLE_ROUTER_MODEL") or "gemini-3.1-flash-lite"
        self._catalogue = "\n".join(self._describe(schema) for schema in ui.tools())
        self._names = [schema.name for schema in ui.tools()]
        self._tasks: set[asyncio.Task] = set()

    @staticmethod
    def _describe(schema: FunctionSchema) -> str:
        args = ", ".join(
            f"{name}: {'|'.join(spec.get('enum', []))}" for name, spec in schema.properties.items()
        )
        return f"- {schema.name}({args}): {schema.description}"

    def route(self, text: str | None, history: str) -> None:
        """Start routing one user message; returns immediately."""
        text = (text or "").strip()
        if not text:
            return
        task = asyncio.create_task(self._route(text, history))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _route(self, text: str, history: str) -> None:
        try:
            started = time.monotonic()
            response = await asyncio.wait_for(
                self._client.aio.models.generate_content(
                    model=self._model,
                    contents=f"Customer message: {text}",
                    config=types.GenerateContentConfig(
                        system_instruction=ROUTE_PROMPT.format(
                            catalogue=self._catalogue,
                            section=self._ui.section,
                            lang=self._ui.lang,
                            theme=self._ui.theme,
                            history=history or "(none)",
                        ),
                        response_mime_type="application/json",
                        response_schema={
                            "type": "OBJECT",
                            "properties": {
                                "tool": {"type": "STRING", "enum": self._names + ["none"]},
                                "value": {"type": "STRING"},
                            },
                            "required": ["tool", "value"],
                        },
                        temperature=0,
                    ),
                ),
                timeout=8,
            )
            pick = json.loads(response.text)
            tool, value = pick.get("tool"), str(pick.get("value", "")).strip()
            took = time.monotonic() - started
            if tool not in self._names:
                logger.info(f"UI router: no action ({took:.1f}s)")
                return
            logger.info(f"UI router: {tool}({value!r}) in {took:.1f}s for {text!r}")
            argument = UIController.TOOL_ARGUMENT.get(tool)
            arguments = {argument: value} if argument else {}

            async def discard(_result) -> None:
                """The router has no model to report to, so the tool's hint goes nowhere."""

            await getattr(self._ui, tool)(
                SimpleNamespace(arguments=arguments, result_callback=discard)
            )
        except Exception as e:
            logger.warning(f"UI router failed: {e}")
