/**
 * Discord user attributes from OAuth / Supabase user_metadata.
 * All fields optional; present when user has logged in with Discord.
 */
export type DiscordUserAttributes = {
  id?: string;
  avatar_url?: string | null;
  full_name?: string | null;
  name?: string | null;
  preferred_username?: string | null;
  email?: string | null;
  picture?: string | null;
  provider_id?: string;
  /** Raw provider (e.g. "discord") */
  provider?: string;
};

/**
 * Console login metadata (browser, IP, timestamp).
 * Set when user authenticates via console code.
 */
export type ConsoleUserInformation = {
  userAgent: string;
  ip?: string | null;
};

/**
 * Generic user object used across the app.
 * Populated from Discord OAuth and/or console code login.
 */
export type AppUser = {
  /** Discord fields; set when user has logged in with Discord */
  discord?: DiscordUserAttributes;
  /** True when user has authenticated via console code */
  consoleUser?: boolean;
  /** When console login occurred (ISO string) */
  consoleTimestamp?: string | null;
  /** Browser and IP info for console login */
  consoleUserInformation?: ConsoleUserInformation | null;
};
