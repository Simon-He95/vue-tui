import type { Style } from "@simon_he/vue-tui/core";

export type GitHubProfile = Readonly<{
  login: string;
  avatar_url: string;
  html_url: string;
  name: string | null;
  company: string | null;
  blog: string | null;
  location: string | null;
  bio: string | null;
  public_repos: number;
  followers: number;
  following: number;
  created_at: string;
}>;

export type ContributionDay = Readonly<{
  date: string;
  count: number;
  level: number;
}>;

export type ContributionData = Readonly<{
  days: readonly ContributionDay[];
  totalText: string;
}>;

export type AvatarCell = Readonly<{
  x: number;
  y: number;
  ch: string;
  style: Style;
}>;

export type AvatarAsset = Readonly<{
  cells: readonly AvatarCell[];
  pngBase64?: string;
}>;

export type CardSnapshot = Readonly<{
  capturedAt: string;
  profile: GitHubProfile;
  contributions: ContributionData;
  avatar: readonly AvatarCell[];
  avatarPngBase64?: string;
}>;

export type DataSource = "live" | "cached";
export type AvatarMode = "cells" | "graphic";

export type LoadingStatus = Readonly<{
  set: (message: string) => void;
  stop: (message?: string) => void;
}>;

export type RenderedTerminalGraphic = Readonly<{
  x: number;
  y: number;
  sequence: string;
}>;
