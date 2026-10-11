import { Avatar, Tooltip } from 'antd';
import { initials } from '../../lib/format';

export const PALETTE = [
  '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#EF4444', '#F97316',
  '#F59E0B', '#84CC16', '#10B981', '#14B8A6', '#06B6D4', '#64748B',
];

/** Round avatar with initials fallback; `tip` shows the name on hover. */
export function UserAvatar({ user, size = 24, tip = true }) {
  if (!user) return null;
  const avatar = (
    <Avatar size={size} src={user.avatarUrl || undefined} style={{ flexShrink: 0, fontSize: Math.max(10, size * 0.42) }}>
      {initials(user.name || user.username)}
    </Avatar>
  );
  return tip ? <Tooltip title={user.name}>{avatar}</Tooltip> : avatar;
}

export function Person({ user, size = 22 }) {
  if (!user) return null;
  return (
    <span className="person">
      <UserAvatar user={user} size={size} tip={false} />
      <span>{user.name}</span>
    </span>
  );
}

/** Options for an antd Select of users, with avatars. */
export function userOptions(users) {
  return (users || []).map((user) => ({
    value: user.id,
    search: `${user.name} ${user.username}`.toLowerCase(),
    label: <Person user={user} size={20} />,
  }));
}

export function ColorSwatches({ value, onChange, colors = PALETTE, small }) {
  return (
    <div className={`swatches${small ? ' swatches--sm' : ''}`}>
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          className={`swatch${value === color ? ' is-active' : ''}`}
          style={{ background: color }}
          onClick={() => onChange?.(color)}
          aria-label={color}
        />
      ))}
    </div>
  );
}
