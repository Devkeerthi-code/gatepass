export type IconName =
  | "logo" | "check" | "x" | "alert" | "clock" | "search" | "wifi-off" | "sync" | "download" | "copy"
  | "calendar" | "pin" | "users" | "plus" | "minus" | "arrow-right" | "arrow-left" | "scan" | "grid"
  | "ticket" | "card" | "key" | "link" | "sun" | "more" | "settings" | "refresh" | "lock" | "music"
  | "gift" | "bolt" | "percent" | "tag" | "ladder" | "share" | "upload" | "eye" | "shuffle" | "bell"
  | "hourglass" | "trophy" | "drag" | "trash" | "chev-down" | "external" | "image";

export function Icon({ name, small, className = "" }: { name: IconName; small?: boolean; className?: string }) {
  return (
    <svg className={`icon ${small ? "icon-sm" : ""} ${className}`} aria-hidden="true">
      <use href={`/icons.svg#${name}`} />
    </svg>
  );
}
