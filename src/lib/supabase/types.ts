/**
 * Hand-written to match supabase/migrations/0001_init.sql. Once the project is
 * linked these can be regenerated instead:
 *
 *   npx supabase gen types typescript --linked > src/lib/supabase/types.ts
 */
import type { BeadStyle, Lang, MysteryKey, Palette, PrayerId } from "@/lib/content";
import type { Rite } from "@/lib/liturgy/types";

export type PrefsRow = {
  user_id: string;
  lang: Lang;
  bead_style: BeadStyle;
  palette: Palette;
  size: number;
  dim: boolean;
  haptics: boolean;
  audio: boolean;
  awake: boolean;
  updated_at: string;
};

export type ProgressRow = {
  user_id: string;
  prayer: PrayerId;
  mystery_set: MysteryKey;
  spirit_step: number;
  mary_step: number;
  at: string;
  updated_at: string;
};

/**
 * One finished prayer, written by the device that finished it. See
 * supabase/migrations/0005_sessions.sql for why the client owns the id and
 * the calendar day.
 */
export type PrayerSessionRow = {
  user_id: string;
  client_id: string;
  prayer: PrayerId;
  mystery_set: MysteryKey | null;
  finished_at: string;
  local_date: string;
  seconds: number;
};

export type ContentRow = {
  key: "design" | "prayers" | "teachings";
  doc: unknown;
  version: number;
  updated_at: string;
};

/** Visible to every signed-in user — nothing private belongs on this row. */
export type ProfileRow = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

/** Readable only by its owner. Phone lives here and not on the profile. */
export type UserPrivateRow = {
  id: string;
  phone: string | null;
  created_at: string;
  updated_at: string;
};

/* ------------------------------- admin side ------------------------------- */

/** Membership is the privilege. A row here is what `is_admin()` looks for. */
export type AdminRow = {
  user_id: string;
  note: string | null;
  granted_by: string | null;
  granted_at: string;
};

/** `show_on` pins a verse to a date; null leaves it in the rotation pool. */
export type VerseRow = {
  id: string;
  text_ar: string;
  text_en: string;
  ref_ar: string | null;
  ref_en: string | null;
  show_on: string | null;
  active: boolean;
  sort: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AnnouncementKind = "banner" | "modal";
export type Audience = "all" | "signed_in" | "signed_out";

export type AnnouncementRow = {
  id: string;
  kind: AnnouncementKind;
  title_ar: string;
  title_en: string;
  body_ar: string | null;
  body_en: string | null;
  cta_label_ar: string | null;
  cta_label_en: string | null;
  cta_url: string | null;
  image_url: string | null;
  dismissible: boolean;
  priority: number;
  audience: Audience;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Configuration rather than content — see the table comment in 0003. */
export type SettingRow = {
  key: string;
  value: unknown;
  updated_by: string | null;
  updated_at: string;
};

/** The copy the nightly reminder sends, stored under key `daily_reminder`. */
export type DailyReminderSetting = {
  title_ar: string;
  title_en: string;
  body_ar: string;
  body_en: string;
  url: string;
};

/* ------------------------------ notifications ----------------------------- */

export type NotificationStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "sent"
  | "failed"
  | "canceled";

export type NotificationRow = {
  id: string;
  title_ar: string;
  title_en: string;
  body_ar: string | null;
  body_en: string | null;
  url: string;
  audience: "all" | "user";
  target_user_id: string | null;
  scheduled_at: string | null;
  status: NotificationStatus;
  sent_at: string | null;
  sent_count: number;
  failed_count: number;
  error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Never reaches the browser: the table has RLS on and no policies, so only the
 * secret key can read it. The type is here because the route handlers under
 * /api/push share this file.
 */
export type PushSubscriptionRow = {
  id: string;
  user_id: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  platform: string | null;
  tz: string;
  reminder_hour: number | null;
  last_remind: string | null;
  /** Local hour for the morning message. 8 by default; null turns it off. */
  morning_hour: number | null;
  /** The device's own date on the morning it was last greeted. */
  last_morning: string | null;
  enabled: boolean;
  failures: number;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
};

/**
 * A device due its morning message, with the streak the copy should speak to.
 *
 * Not a `PushSubscriptionRow`: `due_morning_messages` returns only what the
 * sender needs plus two computed columns, rather than every column of the
 * table. `streak` is 0 and `last_prayed` null for a device that never signed
 * in — there is no account to count sessions against.
 */
export type MorningDueRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  tz: string;
  user_id: string | null;
  streak: number;
  last_prayed: string | null;
};

/** The morning message's switch and destination, under key `morning_message`. */
export type MorningSetting = {
  enabled: boolean;
  url: string;
};

/* -------------------------------- devotions ------------------------------- */

/** Which of the two printed books a page came out of. */
export type DevotionTrack = "individual" | "couples";

/**
 * One day's readings for one church — see 0010_readings.sql.
 *
 * The `_ref` fields are references and are facts; the `_text` fields are a
 * specific translation and belong to whoever made it, which is why every row
 * also carries who that is. Anything the app displays from the text side has
 * to show `translation` and `source` beside it.
 */
export type Reading = {
  /** Which of the source's slots this came from — "text3", "gospel". */
  kind: string;
  /** What this reading IS, in the rite's own words. The app prints this. */
  label: string | null;
  /** The reference, abbreviated the way the rite abbreviates it. A fact. */
  ref: string | null;
  /** The translation, which belongs to whoever made it. */
  text: string | null;
};

export type ReadingRow = {
  /** "YYYY-MM-DD". */
  on_date: string;
  /** One of the app's rites, and the second half of the key. */
  rite: Rite;
  /** The day's title in the source's own words, for checking against ours. */
  liturgic_title: string | null;
  /** In the order the service reads them. Never a fixed set of roles. */
  readings: Reading[];
  audio_url: string | null;
  source: string;
  translation: string | null;
  fetched_at: string;
};

/**
 * One page of a daily devotional, keyed by calendar day rather than by date —
 * see supabase/migrations/0008_devotions.sql. English is nullable throughout
 * because the books are Arabic on paper; the reader falls back per field.
 */
export type DevotionRow = {
  id: string;
  track: DevotionTrack;
  /** 1-12. */
  month: number;
  /** 1-31, constrained to days the month actually has. */
  day: number;
  title_ar: string;
  title_en: string | null;
  verse_ar: string;
  verse_en: string | null;
  verse_ref_ar: string | null;
  verse_ref_en: string | null;
  /** The paragraphs, in reading order. Never empty. */
  body_ar: string[];
  body_en: string[] | null;
  quote_ar: string | null;
  quote_en: string | null;
  quote_source_ar: string | null;
  quote_source_en: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/* --------------------------------- couples -------------------------------- */

/** Two accounts that have said they pray together. See 0009_couples.sql. */
export type CoupleRow = {
  id: string;
  created_at: string;
};

/** One half of a couple. `user_id` is the primary key: one couple per person. */
export type CoupleMemberRow = {
  user_id: string;
  couple_id: string;
  joined_at: string;
};

/** A pairing code. Readable only by whoever asked for it. */
export type CoupleInviteRow = {
  code: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  accepted_by: string | null;
  accepted_at: string | null;
};

/** postgrest-js resolves a table to `never` unless Relationships is present. */
type Table<Row, Insert = Row, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      user_prefs: Table<
        PrefsRow,
        Omit<PrefsRow, "updated_at"> & { updated_at?: string }
      >;
      user_progress: Table<
        ProgressRow,
        Omit<ProgressRow, "updated_at"> & { updated_at?: string }
      >;
      prayer_sessions: Table<
        PrayerSessionRow,
        Omit<PrayerSessionRow, "finished_at"> & { finished_at?: string }
      >;
      content_documents: Table<ContentRow>;
      profiles: Table<
        ProfileRow,
        Omit<ProfileRow, "created_at" | "updated_at"> & {
          created_at?: string;
          updated_at?: string;
        }
      >;
      user_private: Table<
        UserPrivateRow,
        Omit<UserPrivateRow, "created_at" | "updated_at"> & {
          created_at?: string;
          updated_at?: string;
        }
      >;
      app_admins: Table<AdminRow>;
      verses: Table<
        VerseRow,
        // Everything but the text has a default, so a new verse is two fields.
        Partial<Omit<VerseRow, "text_ar" | "text_en">> &
          Pick<VerseRow, "text_ar" | "text_en">
      >;
      daily_devotions: Table<
        DevotionRow,
        // The day, the book and the Arabic are the transcription; everything
        // else has a default or is optional.
        Partial<Omit<DevotionRow, "track" | "month" | "day" | "title_ar" | "verse_ar" | "body_ar">> &
          Pick<DevotionRow, "track" | "month" | "day" | "title_ar" | "verse_ar" | "body_ar">
      >;
      daily_readings: Table<
        ReadingRow,
        // The day and the church are the key; everything else the mirror fills
        // in, and `fetched_at` defaults.
        Partial<Omit<ReadingRow, "on_date" | "rite">> & Pick<ReadingRow, "on_date" | "rite">
      >;
      couples: Table<CoupleRow>;
      couple_members: Table<CoupleMemberRow>;
      couple_invites: Table<CoupleInviteRow>;
      announcements: Table<
        AnnouncementRow,
        Partial<Omit<AnnouncementRow, "title_ar" | "title_en">> &
          Pick<AnnouncementRow, "title_ar" | "title_en">
      >;
      app_settings: Table<
        SettingRow,
        Pick<SettingRow, "key" | "value"> & { updated_by?: string | null }
      >;
      notifications: Table<
        NotificationRow,
        Partial<Omit<NotificationRow, "title_ar" | "title_en">> &
          Pick<NotificationRow, "title_ar" | "title_en">
      >;
      push_subscriptions: Table<
        PushSubscriptionRow,
        Partial<Omit<PushSubscriptionRow, "endpoint" | "p256dh" | "auth">> &
          Pick<PushSubscriptionRow, "endpoint" | "p256dh" | "auth">
      >;
    };
    Views: Record<never, never>;
    Functions: {
      /** Shape check plus "is it free", as one boolean. Callable by anon. */
      username_available: {
        Args: { u: string };
        Returns: boolean;
      };
      /** Defaults to the caller. Granted to authenticated only. */
      is_admin: {
        Args: { uid?: string };
        Returns: boolean;
      };
      /** Secret key only — the rows carry every subscriber's endpoint. */
      due_daily_reminders: {
        Args: Record<string, never>;
        Returns: PushSubscriptionRow[];
      };
      /** Secret key only — endpoints, and the prayer history beside them. */
      due_morning_messages: {
        Args: Record<string, never>;
        Returns: MorningDueRow[];
      };
      /** Consecutive days ending at `today` or the day before. Secret key only. */
      streak_for: {
        Args: { uid: string; today: string };
        Returns: number;
      };
      /**
       * Whether a devotion's calendar day is within a day of the UTC date.
       * Called by the read policy on `daily_devotions`, not by the app.
       */
      devotion_is_due: {
        Args: { m: number; d: number };
        Returns: boolean;
      };
      /** Whether the caller is paired with someone. Also used by that policy. */
      in_couple: {
        Args: { uid?: string };
        Returns: boolean;
      };
      /** A fresh six-character pairing code. Replaces any previous one. */
      create_couple_invite: {
        Args: Record<string, never>;
        Returns: string;
      };
      /** Redeems someone else's code and pairs the two accounts. */
      accept_couple_invite: {
        Args: { invite_code: string };
        Returns: string;
      };
      /** Dissolves the link, for both people. */
      leave_couple: {
        Args: Record<string, never>;
        Returns: undefined;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
