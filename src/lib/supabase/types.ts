/**
 * Hand-written to match supabase/migrations/0001_init.sql. Once the project is
 * linked these can be regenerated instead:
 *
 *   npx supabase gen types typescript --linked > src/lib/supabase/types.ts
 */
import type { BeadStyle, Lang, MysteryKey, Palette, PrayerId } from "@/lib/content";

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
  enabled: boolean;
  failures: number;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
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
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
