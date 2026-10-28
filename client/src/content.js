// Website copy. Every price, warranty and policy below comes from server/knowledge.md,
// the same file the voice assistant answers from, so the page and the bot never disagree.
// All company details are made-up demo data.

export const contact = {
  phone: { display: "06 500 1000", href: "tel:+96265001000" },
  whatsapp: { display: "07 9000 1000", href: "https://wa.me/962790001000" },
  email: "info@alhayat-example.com",
  site: "alhayat-example.com",
};

// Element ids, shared by both languages (the lists below keep the same order). The voice
// agent addresses cards by these.
export const ids = {
  packages: ["small", "medium", "business"],
  addons: ["battery", "maintenance"],
  terms: ["visit", "payment", "warranty"],
  faq: ["weather", "payback", "cleaning", "outside", "netmetering"],
};

// Installment terms: 20% down, the rest over 24 months, no interest.
export const INSTALLMENT = { down: 0.2, months: 24 };

const money = (n, cur) => `${Math.round(n).toLocaleString("en-US")} ${cur}`;

export function installment(price, cur) {
  const down = price * INSTALLMENT.down;
  const monthly = (price - down) / INSTALLMENT.months;
  return { down: money(down, cur), monthly: money(monthly, cur) };
}

export const content = {
  ar: {
    cur: "د.أ",
    stats: [
      { n: "2018", l: "سنة التأسيس" },
      { n: "+40", l: "مهندس وموظف" },
      { n: "25", l: "سنة ضمان على الألواح" },
      { n: "24", l: "شهر تقسيط بدون فوائد" },
    ],
    packages: [
      {
        img: "home-small.jpg",
        alt: "بيت بنظام طاقة شمسية صغير على السطح",
        name: "نظام البيت الصغير",
        size: "3 كيلو واط",
        fit: "يكفي بيتاً فيه غرفتا نوم أو ثلاث.",
        price: 2400,
        features: ["تركيب خلال 2 إلى 3 أيام عمل", "نتابع معاملة شركة الكهرباء عنك", "ضمان 25 سنة على الألواح"],
      },
      {
        img: "home-medium.jpg",
        alt: "فيلا بنظام طاقة شمسية أكبر على السطح",
        name: "نظام البيت المتوسط",
        size: "5 كيلو واط",
        fit: "يكفي بيتاً كبيراً أو شقتين.",
        price: 3800,
        badge: "للبيوت الكبيرة",
        features: ["تركيب خلال 2 إلى 3 أيام عمل", "نتابع معاملة شركة الكهرباء عنك", "ضمان 25 سنة على الألواح"],
      },
      {
        img: "farm.jpg",
        alt: "مزرعة بألواح شمسية على سطح المستودع وفي الأرض",
        name: "المحلات والمزارع",
        size: "10 كيلو واط أو أكثر",
        fit: "للمحلات والمزارع والمنشآت.",
        priceText: "حسب الموقع",
        priceNote: "يزور المهندس الموقع ثم نحدّد السعر.",
        features: ["تركيب خلال أسبوع إلى أسبوعين", "نتابع معاملة شركة الكهرباء عنك", "ضمان 25 سنة على الألواح"],
      },
    ],
    addons: [
      {
        img: "battery.jpg",
        alt: "بطارية تخزين منزلية معلّقة على الجدار",
        name: "بطاريات التخزين",
        text: "بطارية 5 كيلو واط ساعة تخزّن إنتاج النهار لتستعمله في المساء.",
        price: 1150,
        unit: "للبطارية",
      },
      {
        img: "maintenance.jpg",
        alt: "فنّي ينظّف ألواحاً شمسية مغبرّة",
        name: "الصيانة الدورية",
        text: "زيارة كل ستة شهور ننظّف فيها الألواح ونفحص النظام.",
        price: 60,
        unit: "للزيارة",
      },
    ],
    terms: [
      {
        t: "زيارة المهندس",
        p: "الكشف على الموقع مجاني داخل عمّان. خارجها رسم الزيارة 20 دينار ونخصمه من السعر إذا اتفقنا.",
      },
      {
        t: "طرق الدفع",
        p: "كاش أو تحويل بنكي، أو تقسيط 24 شهراً بدون فوائد عبر شركة تمويل شريكة، بدفعة أولى 20% من سعر النظام.",
      },
      {
        t: "الضمان",
        p: "25 سنة على أداء الألواح، و10 سنين على الإنفرتر، وسنتان على التركيب. لا يغطّي الضمان الأعطال الناتجة عن سوء الاستخدام.",
      },
    ],
    about: {
      p: [
        "شركة الحياة متخصصة ببيع وتركيب أنظمة الطاقة الشمسية للبيوت والمحلات والمزارع. تأسسنا سنة 2018 ومقرّنا الرئيسي في عمّان، الجبيهة، ويعمل معنا حوالي 40 موظفاً ومهندساً.",
        "نغطّي كل المحافظات، ونرافقك من الكشف على الموقع حتى يبدأ النظام بالإنتاج، بما فيها متابعة معاملة التسجيل عند شركة الكهرباء.",
      ],
      not: "ما لا نقدّمه: لا نعمل سخانات مياه شمسية حالياً، ولا نبيع الألواح من دون تركيب.",
    },
    steps: [
      { t: "زيارة وكشف", p: "يزور المهندس موقعك ويقيس المساحة والاستهلاك." },
      { t: "عرض السعر", p: "تحصل على سعر واضح وطريقة دفع تناسبك." },
      { t: "التركيب", p: "من يومين إلى ثلاثة أيام للبيوت، ومن أسبوع إلى أسبوعين للمحلات والمزارع." },
      { t: "التسجيل والتشغيل", p: "نمشّي معاملتك عند شركة الكهرباء، وتستغرق عادة من أسبوعين إلى أربعة." },
    ],
    faq: [
      {
        q: "هل تعمل الألواح في الشتاء وفي الأيام الغائمة؟",
        a: "نعم تعمل، لكن إنتاجها يقلّ. في الأيام الغائمة جداً يصير حوالي النصف تقريباً.",
      },
      {
        q: "كم سنة تحتاج حتى أسترجع ما دفعته؟",
        a: "غالباً من أربع إلى ست سنوات، وذلك حسب استهلاك بيتك.",
      },
      {
        q: "هل يجب تنظيف الألواح؟",
        a: "نعم، ننصح بتنظيفها مرتين في السنة على الأقل، خاصة بعد موسم الغبار.",
      },
      {
        q: "هل تعملون خارج عمّان؟",
        a: "نعم، نغطّي كل المحافظات، ويُضاف رسم الزيارة المذكور أعلاه.",
      },
      {
        q: "هل أستطيع بيع الكهرباء الزائدة؟",
        a: "نعم، عبر نظام صافي القياس المعتمد عند شركة الكهرباء، ونساعدك في الإجراءات.",
      },
    ],
    hours: [
      { d: "الأحد إلى الخميس", h: "9:00 صباحاً - 5:00 مساءً" },
      { d: "السبت", h: "10:00 صباحاً - 3:00 عصراً (استشارات فقط)" },
      { d: "الجمعة", h: "عطلة" },
    ],
    address: "عمّان، الجبيهة",
    waIntro: "مرحباً، بدي أستفسر عن ",
    chosen: "اخترته",
    perMonth: "شهرياً",
    downLabel: "دفعة أولى",
    installLabel: "أو تقسيط",
  },

  en: {
    cur: "JOD",
    stats: [
      { n: "2018", l: "Founded" },
      { n: "40+", l: "Engineers and staff" },
      { n: "25", l: "Years panel warranty" },
      { n: "24", l: "Months interest-free" },
    ],
    packages: [
      {
        img: "home-small.jpg",
        alt: "A house with a small rooftop solar system",
        name: "Small home system",
        size: "3 kW",
        fit: "Covers a home with two or three bedrooms.",
        price: 2400,
        features: ["Installed in 2 to 3 working days", "We handle the utility registration", "25-year panel warranty"],
      },
      {
        img: "home-medium.jpg",
        alt: "A villa with a larger rooftop solar system",
        name: "Medium home system",
        size: "5 kW",
        fit: "Covers a large home or two apartments.",
        price: 3800,
        badge: "For larger homes",
        features: ["Installed in 2 to 3 working days", "We handle the utility registration", "25-year panel warranty"],
      },
      {
        img: "farm.jpg",
        alt: "A farm with solar panels on the barn roof and on the ground",
        name: "Shops and farms",
        size: "10 kW or more",
        fit: "For shops, farms and facilities.",
        priceText: "Depends on site",
        priceNote: "An engineer visits the site, then we quote.",
        features: ["Installed in 1 to 2 weeks", "We handle the utility registration", "25-year panel warranty"],
      },
    ],
    addons: [
      {
        img: "battery.jpg",
        alt: "A wall-mounted home storage battery",
        name: "Storage batteries",
        text: "A 5 kWh battery stores daytime production so you can use it in the evening.",
        price: 1150,
        unit: "per battery",
      },
      {
        img: "maintenance.jpg",
        alt: "A technician cleaning dusty solar panels",
        name: "Regular maintenance",
        text: "A visit every six months to clean the panels and check the system.",
        price: 60,
        unit: "per visit",
      },
    ],
    terms: [
      {
        t: "Engineer visit",
        p: "Site inspection is free inside Amman. Outside it the visit fee is 20 JOD, deducted from the price if we agree.",
      },
      {
        t: "Payment",
        p: "Cash or bank transfer, or 24 months interest-free through a partner finance company, with 20% down.",
      },
      {
        t: "Warranty",
        p: "25 years on panel performance, 10 years on the inverter, 2 years on installation. Damage from misuse is not covered.",
      },
    ],
    about: {
      p: [
        "Al Hayat sells and installs solar systems for homes, shops and farms. We were founded in 2018, our head office is in Jubeiha, Amman, and about 40 engineers and staff work with us.",
        "We cover every governorate and stay with you from the site visit until the system is producing, including the utility registration.",
      ],
      not: "What we don't do: we don't offer solar water heaters at the moment, and we don't sell panels without installation.",
    },
    steps: [
      { t: "Visit and survey", p: "An engineer visits your site and measures the space and your usage." },
      { t: "Quote", p: "You get a clear price and a payment plan that suits you." },
      { t: "Installation", p: "Two to three days for homes, one to two weeks for shops and farms." },
      { t: "Registration and start-up", p: "We run your utility registration, which usually takes two to four weeks." },
    ],
    faq: [
      {
        q: "Do the panels work in winter and on cloudy days?",
        a: "Yes, but production drops. On very cloudy days it falls to roughly half.",
      },
      {
        q: "How long until I earn back what I paid?",
        a: "Usually four to six years, depending on your home's consumption.",
      },
      {
        q: "Do the panels need cleaning?",
        a: "Yes. We recommend cleaning them at least twice a year, especially after the dust season.",
      },
      {
        q: "Do you work outside Amman?",
        a: "Yes, every governorate, with the visit fee mentioned above.",
      },
      {
        q: "Can I sell the extra electricity?",
        a: "Yes, through the utility's net metering scheme, and we help with the paperwork.",
      },
    ],
    hours: [
      { d: "Sunday to Thursday", h: "9:00 AM - 5:00 PM" },
      { d: "Saturday", h: "10:00 AM - 3:00 PM (consultations only)" },
      { d: "Friday", h: "Closed" },
    ],
    address: "Jubeiha, Amman",
    waIntro: "Hello, I'd like to ask about the ",
    chosen: "Your pick",
    perMonth: "per month",
    downLabel: "Down payment",
    installLabel: "Or installments",
  },
};
