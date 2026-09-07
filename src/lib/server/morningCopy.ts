import "server-only";

/**
 * The words the morning message is written from.
 *
 * Unlike the nightly reminder, which is one stored string an admin edits, this
 * is a pool. A greeting that arrives every single morning has to be different
 * every single morning or it stops being read after a week — so there are many
 * of each kind, and which one lands is decided per device, per day.
 *
 * The tone is deliberate and worth stating, because it is easy to drift from.
 * A streak here is faithfulness, not a score. Nothing warns, nothing threatens
 * a loss, nothing implies the person is behind. Someone who has prayed thirty
 * mornings and someone who has never opened the app should both be able to read
 * their message without flinching — the first is not being flattered and the
 * second is not being scolded. Peace first, then the invitation.
 *
 * Both languages are written, not translated. The service worker picks one when
 * the push arrives, using the language set on the device at that moment, so
 * both halves ship in every payload and both have to stand on their own.
 */

/** `{n}` is the bare number; `{days}` is the number with its noun, per language. */
export type MorningMessage = {
  title_ar: string;
  title_en: string;
  body_ar: string;
  body_en: string;
};

/**
 * Which pool a device is greeted from.
 *
 *   start      no prayer on record at all — an invitation, never a reproach
 *   return     prayed before, the run has ended — the door is open, that is all
 *   prayed     already prayed today, before the message went out
 *   day1       one day. The hardest one to have reached, and worth saying so
 *   building   2–6, the stretch where it is still fragile
 *   strong     7–29
 *   deep       30 and beyond
 */
export type MorningBucket =
  | "start"
  | "return"
  | "prayed"
  | "day1"
  | "building"
  | "strong"
  | "deep";

/* -------------------------------- numbers -------------------------------- */

const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

/** Arabic-Indic numerals, written out rather than left to the runtime's ICU. */
const arNumber = (n: number): string =>
  String(n).replace(/\d/g, (d) => AR_DIGITS[Number(d)]);

/**
 * Arabic counts its nouns by how many there are, and getting this wrong is the
 * first thing a reader notices: يوم واحد، يومان، ٣ أيام، ١١ يومًا.
 */
function arDays(n: number): string {
  if (n === 1) return "يوم واحد";
  if (n === 2) return "يومان";
  if (n >= 3 && n <= 10) return `${arNumber(n)} أيام`;
  return `${arNumber(n)} يومًا`;
}

const enDays = (n: number): string => `${n} ${n === 1 ? "day" : "days"}`;

/* --------------------------------- pools --------------------------------- */

const POOLS: Record<MorningBucket, MorningMessage[]> = {
  /* ------------------------------------------------------------- start -- */
  start: [
    {
      title_ar: "صباح الخير",
      title_en: "Good morning",
      body_ar: "يومٌ جديد، ودعوةٌ هادئة. صلاة واحدة تكفي لتبدأ.",
      body_en: "A new day, and a quiet invitation. One prayer is enough to begin.",
    },
    {
      title_ar: "ابدأ بسلام",
      title_en: "Begin in peace",
      body_ar: "لا شيء مطلوب منك اليوم سوى بضع دقائق. والروح القدس يعرف الباقي.",
      body_en: "Nothing is asked of you today but a few minutes. The Holy Spirit knows the rest.",
    },
    {
      title_ar: "السلام معك",
      title_en: "Peace be with you",
      body_ar: "اليوم الأول هو أقصر مسافة بينك وبين الصلاة. اجعله اليوم.",
      body_en: "The first day is the shortest distance between you and prayer. Let it be today.",
    },
    {
      title_ar: "صباحك نور",
      title_en: "A bright morning",
      body_ar: "خذ نفسًا، وصلِّ مرة واحدة. هكذا تبدأ كل الأشياء الجميلة.",
      body_en: "Take a breath, and pray once. That is how every good thing starts.",
    },
    {
      title_ar: "دعوة صغيرة",
      title_en: "A small invitation",
      body_ar: "لستَ متأخرًا عن شيء. الصباح أمامك، والصلاة تنتظر.",
      body_en: "You are not behind on anything. The morning is yours, and prayer is waiting.",
    },
    {
      title_ar: "محبة في الصباح",
      title_en: "Love in the morning",
      body_ar: "الله لا يحصي البدايات، بل يفرح بها. ابدأ اليوم.",
      body_en: "God does not count beginnings, He delights in them. Begin today.",
    },
    {
      title_ar: "خطوة أولى",
      title_en: "A first step",
      body_ar: "دقائق قليلة اليوم تصير عادةً بعد أسبوع. لنبدأ معًا.",
      body_en: "A few minutes today becomes a habit in a week. Let us start together.",
    },
    {
      title_ar: "بسلامٍ تبدأ",
      title_en: "Start gently",
      body_ar: "لا حاجة لأن تكون مستعدًا. تعال كما أنت، وصلِّ.",
      body_en: "You do not need to be ready. Come as you are, and pray.",
    },
  ],

  /* ------------------------------------------------------------ return -- */
  return: [
    {
      title_ar: "البابُ مفتوح",
      title_en: "The door is open",
      body_ar: "مرّت أيام، ولا بأس. اليوم يكفي أن تعود مرة واحدة.",
      body_en: "Some days have passed, and that is alright. Today it is enough to come back once.",
    },
    {
      title_ar: "صباح الخير",
      title_en: "Good morning",
      body_ar: "لا شيء انكسر. الصلاة ليست سلسلة تُحسب، بل لقاءٌ يتجدد.",
      body_en: "Nothing is broken. Prayer is not a chain to be counted, it is a meeting that begins again.",
    },
    {
      title_ar: "عُد بسلام",
      title_en: "Come back in peace",
      body_ar: "الروح القدس لم يذهب إلى أي مكان. صلِّ اليوم وابدأ من جديد.",
      body_en: "The Holy Spirit has not gone anywhere. Pray today and start again.",
    },
    {
      title_ar: "من جديد",
      title_en: "Fresh start",
      body_ar: "كل صباحٍ فرصة كاملة. لا تنظر خلفك، فقط ابدأ.",
      body_en: "Every morning is a whole opportunity. Do not look back, just begin.",
    },
    {
      title_ar: "أنت محبوب",
      title_en: "You are loved",
      body_ar: "غيابك لم يغيّر شيئًا في محبته. تعال، ولو لبضع دقائق.",
      body_en: "Your absence changed nothing in His love. Come, even for a few minutes.",
    },
    {
      title_ar: "اليوم يكفي",
      title_en: "Today is enough",
      body_ar: "لا تفكر في الأمس ولا في غد. صلاة واحدة، الآن.",
      body_en: "Do not think about yesterday or tomorrow. One prayer, now.",
    },
    {
      title_ar: "صباحٌ هادئ",
      title_en: "A quiet morning",
      body_ar: "ابدأ سلسلة جديدة اليوم. اليوم الأول هو الأهم دائمًا.",
      body_en: "Start a new streak today. The first day is always the one that matters.",
    },
    {
      title_ar: "لنبدأ ثانيةً",
      title_en: "Let us begin again",
      body_ar: "لا أحد يحصي أيامك سواك. اجعل اليوم أوّلها.",
      body_en: "No one is counting your days but you. Make today the first.",
    },
  ],

  /* ------------------------------------------------------------ prayed -- */
  prayed: [
    {
      title_ar: "صلّيتَ اليوم",
      title_en: "You prayed today",
      body_ar: "{days} متتالية، وقد بدأت هذا اليوم بها. سلامٌ على صباحك.",
      body_en: "{days} in a row, and you have already begun this one. Peace on your morning.",
    },
    {
      title_ar: "بدأتَ باكرًا",
      title_en: "An early start",
      body_ar: "صلاتك سبقت هذه الرسالة. {days} متتالية — فليرافقك السلام.",
      body_en: "Your prayer came before this message. {days} in a row — may peace go with you.",
    },
    {
      title_ar: "سلام",
      title_en: "Peace",
      body_ar: "لا شيء مطلوب اليوم؛ لقد صلّيت. {days} متتالية.",
      body_en: "Nothing is asked of you today; you have prayed. {days} in a row.",
    },
    {
      title_ar: "صباحٌ مبارك",
      title_en: "A blessed morning",
      body_ar: "بدأت يومك عند الروح القدس. {days} متتالية، واليوم لم يبدأ بعد.",
      body_en: "You began your day with the Holy Spirit. {days} in a row, and the day is only starting.",
    },
  ],

  /* -------------------------------------------------------------- day1 -- */
  day1: [
    {
      title_ar: "يومٌ واحد",
      title_en: "One day",
      body_ar: "بدأت بالأمس. اليوم هو ما يجعلها عادة — صلِّ مرة أخرى.",
      body_en: "You began yesterday. Today is what turns it into a habit — pray once more.",
    },
    {
      title_ar: "أصعبُ يومٍ مضى",
      title_en: "The hardest day is behind you",
      body_ar: "اليوم الأول هو الأثقل، وقد عبرته. اجعل الثاني اليوم.",
      body_en: "The first day is the heaviest, and you crossed it. Make today the second.",
    },
    {
      title_ar: "استمر",
      title_en: "Keep going",
      body_ar: "يومٌ واحد يصير يومين بصلاة واحدة. لا أكثر.",
      body_en: "One day becomes two with a single prayer. Nothing more than that.",
    },
    {
      title_ar: "بدايةٌ حقيقية",
      title_en: "A real beginning",
      body_ar: "لقد بدأت فعلًا. صلِّ اليوم وتكون قد بدأت مرتين.",
      body_en: "You have actually started. Pray today and you will have started twice.",
    },
    {
      title_ar: "صباح الخير",
      title_en: "Good morning",
      body_ar: "يومك الأول محفوظ. أضف إليه الثاني بسلام.",
      body_en: "Your first day is kept. Add the second one to it, gently.",
    },
    {
      title_ar: "خطوةٌ ثانية",
      title_en: "A second step",
      body_ar: "لا شيء يُبنى في يوم، لكن كل شيء يبدأ بيومين.",
      body_en: "Nothing is built in a day, but everything begins with two.",
    },
  ],

  /* ---------------------------------------------------------- building -- */
  building: [
    {
      title_ar: "{days} متتالية",
      title_en: "{days} in a row",
      body_ar: "شيءٌ جميل يتكوّن. صلِّ اليوم وأبقِه حيًا.",
      body_en: "Something good is forming. Pray today and keep it alive.",
    },
    {
      title_ar: "صباح الخير",
      title_en: "Good morning",
      body_ar: "{days} من الصلاة خلفك. واليوم دقائق قليلة، لا أكثر.",
      body_en: "{days} of prayer behind you. Today, just a few minutes, no more.",
    },
    {
      title_ar: "استمرارك جميل",
      title_en: "You are keeping at it",
      body_ar: "{days} متتالية. لا تحسبها، فقط عش اليوم معه.",
      body_en: "{days} in a row. Do not count them, just spend today with Him.",
    },
    {
      title_ar: "سلامٌ على أيامك",
      title_en: "Peace on your days",
      body_ar: "{days} حتى الآن. الأسبوع الأول قريب — واصل بمحبة.",
      body_en: "{days} so far. The first week is close — keep going with love.",
    },
    {
      title_ar: "يومٌ آخر",
      title_en: "One more day",
      body_ar: "{days} متتالية، واليوم أمامك كله. ابدأه بالصلاة.",
      body_en: "{days} in a row, and today is entirely ahead of you. Begin it with prayer.",
    },
    {
      title_ar: "أنت على الطريق",
      title_en: "You are on your way",
      body_ar: "{days} من الوفاء الصغير الهادئ. وهذا هو كل شيء.",
      body_en: "{days} of small, quiet faithfulness. That is the whole thing.",
    },
    {
      title_ar: "محبةٌ ومثابرة",
      title_en: "Love and persistence",
      body_ar: "{days} متتالية. لا أحد يراها سواك وسواه — وهذا يكفي.",
      body_en: "{days} in a row. No one sees them but you and Him — and that is enough.",
    },
    {
      title_ar: "صباحك سلام",
      title_en: "A peaceful morning",
      body_ar: "أبقِ {days} حيّة بصلاة واحدة اليوم.",
      body_en: "Keep your {days} alive with one prayer today.",
    },
  ],

  /* ------------------------------------------------------------ strong -- */
  strong: [
    {
      title_ar: "{days} متتالية",
      title_en: "{days} in a row",
      body_ar: "صارت الصلاة جزءًا من صباحك. لا تتوقف اليوم.",
      body_en: "Prayer has become part of your morning. Do not stop today.",
    },
    {
      title_ar: "وفاءٌ هادئ",
      title_en: "Quiet faithfulness",
      body_ar: "{days} دون انقطاع. ليس رقمًا، بل عادةً صارت لك.",
      body_en: "{days} unbroken. Not a number, but a habit that has become yours.",
    },
    {
      title_ar: "صباح الخير",
      title_en: "Good morning",
      body_ar: "{days} متتالية خلفك، ويومٌ جديد أمامك. صلِّ بسلام.",
      body_en: "{days} in a row behind you, a new day ahead. Pray in peace.",
    },
    {
      title_ar: "استمر بمحبة",
      title_en: "Keep going in love",
      body_ar: "{days} أعطيتها له. أعطِه اليوم أيضًا.",
      body_en: "{days} you have given Him. Give Him today as well.",
    },
    {
      title_ar: "ثبات",
      title_en: "Steadiness",
      body_ar: "{days} متتالية. ليس الأمر في العدد، بل في أنك ما زلت تأتي.",
      body_en: "{days} in a row. It is not the count, it is that you keep coming.",
    },
    {
      title_ar: "سلامٌ ومحبة",
      title_en: "Peace and love",
      body_ar: "{days} من الصباحات معه. اجعل هذا الصباح واحدًا منها.",
      body_en: "{days} of mornings with Him. Let this morning be one of them.",
    },
    {
      title_ar: "نعمةٌ يومية",
      title_en: "A daily grace",
      body_ar: "{days} متتالية. الصلاة اليوم أقصر من التفكير فيها.",
      body_en: "{days} in a row. Praying today is shorter than thinking about it.",
    },
    {
      title_ar: "أبقِها حيّة",
      title_en: "Keep it alive",
      body_ar: "{days} حتى هذا الصباح. دقائق قليلة وتصير غدًا أطول.",
      body_en: "{days} as of this morning. A few minutes and tomorrow it is longer.",
    },
  ],

  /* -------------------------------------------------------------- deep -- */
  deep: [
    {
      title_ar: "{days} متتالية",
      title_en: "{days} in a row",
      body_ar: "شهرٌ وأكثر من الوفاء. صباحك صار صلاة — أكمل اليوم.",
      body_en: "A month and more of faithfulness. Your mornings have become prayer — continue today.",
    },
    {
      title_ar: "وفاءٌ طويل",
      title_en: "A long faithfulness",
      body_ar: "{days} دون انقطاع. قليلون يصلون إلى هنا، ولا أحد يصل بالصدفة.",
      body_en: "{days} unbroken. Few get here, and no one gets here by accident.",
    },
    {
      title_ar: "صباح الخير",
      title_en: "Good morning",
      body_ar: "{days} متتالية. لا شيء تثبته اليوم — فقط صلِّ، كعادتك.",
      body_en: "{days} in a row. Nothing to prove today — just pray, as you do.",
    },
    {
      title_ar: "سلامٌ عميق",
      title_en: "A deep peace",
      body_ar: "{days} حملتها إليه. وهذا الصباح واحدٌ منها.",
      body_en: "{days} you have carried to Him. This morning is one of them.",
    },
    {
      title_ar: "محبةٌ ثابتة",
      title_en: "Steadfast love",
      body_ar: "{days} متتالية. الصلاة لم تعد شيئًا تتذكره، بل شيئًا أنت عليه.",
      body_en: "{days} in a row. Prayer is no longer something you remember, it is something you are.",
    },
    {
      title_ar: "نعمة",
      title_en: "Grace",
      body_ar: "{days} من الصباحات. أضف إليها هذا الصباح بهدوء.",
      body_en: "{days} of mornings. Add this one quietly.",
    },
    {
      title_ar: "استمراريةٌ نادرة",
      title_en: "A rare constancy",
      body_ar: "{days} متتالية، وما زال اليوم يستحق دقائقه.",
      body_en: "{days} in a row, and today still deserves its minutes.",
    },
    {
      title_ar: "أنت أمين",
      title_en: "You have been faithful",
      body_ar: "{days} دون أن يفوتك يوم. فليكن سلامه معك اليوم أيضًا.",
      body_en: "{days} without missing one. May His peace be with you today as well.",
    },
  ],
};

/**
 * Days worth marking. Kept short on purpose — a milestone every week would
 * make none of them a milestone.
 */
const MILESTONES: Record<number, MorningMessage> = {
  7: {
    title_ar: "أسبوعٌ كامل",
    title_en: "A full week",
    body_ar: "سبعة أيام متتالية. أسبوعٌ من الصلاة لم يكن موجودًا قبل أسبوع. سلامٌ عليك.",
    body_en: "Seven days in a row. A week of prayer that did not exist a week ago. Peace to you.",
  },
  30: {
    title_ar: "شهرٌ من الصلاة",
    title_en: "A month of prayer",
    body_ar: "٣٠ يومًا دون انقطاع. ما بدأ كدقائق صار الآن جزءًا من حياتك.",
    body_en: "Thirty days unbroken. What began as a few minutes is now part of your life.",
  },
  50: {
    title_ar: "خمسون يومًا",
    title_en: "Fifty days",
    body_ar: "٥٠ صباحًا أعطيتها له. أكمل اليوم بالهدوء نفسه الذي بدأت به.",
    body_en: "Fifty mornings given to Him. Continue today with the same quiet you began with.",
  },
  100: {
    title_ar: "مئة يوم",
    title_en: "One hundred days",
    body_ar: "١٠٠ يوم متتالٍ من الصلاة. لا كلمات تكفي — فقط سلامٌ ومحبة.",
    body_en: "A hundred consecutive days of prayer. There are not words for it — only peace and love.",
  },
  200: {
    title_ar: "مئتا يوم",
    title_en: "Two hundred days",
    body_ar: "٢٠٠ يوم. أكثر من نصف سنة، صباحًا بعد صباح، دون أن يفوتك واحد.",
    body_en: "Two hundred days. More than half a year, morning after morning, without missing one.",
  },
  365: {
    title_ar: "سنةٌ كاملة",
    title_en: "A whole year",
    body_ar: "٣٦٥ يومًا متتاليًا. سنةٌ من الوفاء الهادئ. فليملأ سلامه قلبك اليوم.",
    body_en: "Three hundred and sixty-five days in a row. A year of quiet faithfulness. May His peace fill you today.",
  },
};

/* -------------------------------- selection ------------------------------- */

/**
 * FNV-1a. Not for security — this only has to spread evenly and give the same
 * answer on every server that runs it, which `Math.random()` would not.
 */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function bucketFor(
  streak: number,
  prayedToday: boolean,
  everPrayed: boolean,
): MorningBucket {
  if (prayedToday) return "prayed";
  if (streak === 0) return everPrayed ? "return" : "start";
  if (streak === 1) return "day1";
  if (streak < 7) return "building";
  if (streak < 30) return "strong";
  return "deep";
}

/**
 * The message one device reads this morning.
 *
 * Seeded by the device and the date together, which buys two things at once:
 * the same device gets a different message tomorrow, and two devices greeted in
 * the same minute do not get the same one. It is also stable — a retry inside
 * the same hour composes the identical text rather than a second, different
 * notification.
 */
export function morningMessage(args: {
  /** The subscription row's id. Any stable per-device string works. */
  seed: string;
  /** The device's own calendar date, `YYYY-MM-DD`. */
  date: string;
  streak: number;
  prayedToday: boolean;
  everPrayed: boolean;
}): MorningMessage {
  const { seed, date, streak, prayedToday, everPrayed } = args;

  // A milestone outranks the band it falls in, but not a prayer already said:
  // "you reached thirty days" reads oddly next to a day that is already done.
  const milestone = prayedToday ? undefined : MILESTONES[streak];
  const pool = milestone
    ? [milestone]
    : POOLS[bucketFor(streak, prayedToday, everPrayed)];

  const pick = pool[hash(`${seed}:${date}`) % pool.length];

  const fill = (s: string, ar: boolean): string =>
    s
      .replace(/\{days\}/g, ar ? arDays(streak) : enDays(streak))
      .replace(/\{n\}/g, ar ? arNumber(streak) : String(streak));

  return {
    title_ar: fill(pick.title_ar, true),
    title_en: fill(pick.title_en, false),
    body_ar: fill(pick.body_ar, true),
    body_en: fill(pick.body_en, false),
  };
}
