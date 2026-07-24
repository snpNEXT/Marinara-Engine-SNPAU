export type NoodleProfileConnection = "followers" | "following";

export type NoodleNavigationState =
  | { mode: "public"; view: "home" }
  | { mode: "public"; view: "search" }
  | { mode: "public"; view: "notifications" }
  | {
      mode: "public";
      view: "profile";
      accountId: string | null;
      connection: NoodleProfileConnection | null;
    }
  | { mode: "private"; view: "hub" }
  | { mode: "private"; view: "profiles" }
  | { mode: "private"; view: "profile"; accountId: string }
  | { mode: "private"; view: "create-profile"; publicAccountId: string }
  | { mode: "verification" }
  | { mode: "settings" };
