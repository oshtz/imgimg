import { UserAvatar } from "../UserAvatar";

export function UserBadge(props: { userId: string; label?: string }) {
  const label = props.label ?? props.userId;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
      <UserAvatar value={props.userId} size={14} style="shape" />
      <span className="max-w-[140px] truncate" title={label}>{label}</span>
    </span>
  );
}
