import { content, contact, installment } from "./content.js";

function h(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  n.append(...kids.filter((c) => c != null));
  return n;
}

const $ = (id) => document.getElementById(id);
const fill = (id, ...kids) => $(id).replaceChildren(...kids);

function packageCard(p, c) {
  const priced = p.price != null;
  const price = priced
    ? h(
        "p",
        { class: "price" },
        h("span", { class: "amount" }, p.price.toLocaleString("en-US")),
        h("span", { class: "cur" }, ` ${c.cur}`),
      )
    : h("p", { class: "price text" }, p.priceText);

  let extra;
  if (priced) {
    const i = installment(p.price, c.cur);
    extra = h(
      "p",
      { class: "plan" },
      `${c.installLabel}: `,
      h("bdi", {}, `${i.monthly} ${c.perMonth}`),
      ` (${c.downLabel} `,
      h("bdi", {}, i.down),
      ")",
    );
  } else {
    extra = h("p", { class: "plan" }, p.priceNote);
  }

  return h(
    "article",
    { class: `card pkg${p.badge ? " featured" : ""}` },
    h(
      "div",
      { class: "media" },
      h("img", { src: `img/${p.img}`, alt: p.alt, loading: "lazy", width: "1376", height: "768" }),
      p.badge ? h("span", { class: "badge" }, p.badge) : null,
    ),
    h(
      "div",
      { class: "card-body" },
      h("p", { class: "kicker" }, p.size),
      h("h3", {}, p.name),
      h("p", { class: "fit" }, p.fit),
      price,
      extra,
      h("ul", { class: "ticks" }, ...p.features.map((f) => h("li", {}, f))),
    ),
  );
}

function addonCard(a, c) {
  return h(
    "article",
    { class: "card addon" },
    h("div", { class: "media" }, h("img", { src: `img/${a.img}`, alt: a.alt, loading: "lazy", width: "1376", height: "768" })),
    h(
      "div",
      { class: "card-body" },
      h("h3", {}, a.name),
      h("p", { class: "fit" }, a.text),
      h(
        "p",
        { class: "price small" },
        h("span", { class: "amount" }, a.price.toLocaleString("en-US")),
        h("span", { class: "cur" }, ` ${c.cur} ${a.unit}`),
      ),
    ),
  );
}

export function renderSite(lang) {
  const c = content[lang];

  fill(
    "stats",
    ...c.stats.map((s) => h("li", {}, h("strong", {}, s.n), h("span", {}, s.l))),
  );
  fill("packages", ...c.packages.map((p) => packageCard(p, c)));
  fill("addons", ...c.addons.map((a) => addonCard(a, c)));
  fill("terms", ...c.terms.map((x) => h("div", { class: "term" }, h("h3", {}, x.t), h("p", {}, x.p))));

  fill("aboutText", ...c.about.p.map((t) => h("p", {}, t)), h("p", { class: "note" }, c.about.not));
  fill(
    "steps",
    ...c.steps.map((s, i) =>
      h("li", {}, h("span", { class: "num", "aria-hidden": "true" }, String(i + 1)), h("div", {}, h("h3", {}, s.t), h("p", {}, s.p))),
    ),
  );
  fill(
    "faq",
    ...c.faq.map((f) => h("details", {}, h("summary", {}, f.q), h("p", {}, f.a))),
  );

  fill("hours", ...c.hours.map((r) => h("li", {}, h("span", {}, r.d), h("bdi", {}, r.h))));
  fill("address", c.address);
  fill("phoneVal", h("a", { href: contact.phone.href, dir: "ltr" }, contact.phone.display));
  fill("waVal", h("a", { href: contact.whatsapp.href, target: "_blank", rel: "noopener", dir: "ltr" }, contact.whatsapp.display));
  fill("mailVal", h("a", { href: `mailto:${contact.email}`, dir: "ltr" }, contact.email));
  $("waCta").href = contact.whatsapp.href;
  $("callCta").href = contact.phone.href;
}
