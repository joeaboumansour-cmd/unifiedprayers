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
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
