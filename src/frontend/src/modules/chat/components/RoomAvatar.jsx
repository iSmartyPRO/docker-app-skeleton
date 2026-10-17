import { Avatar } from 'antd';
import { initials } from '../../../lib/format';
import { UserAvatar } from '../../shared/People';
// The chat styles stay with the shell: the header's chat button draws room avatars too.
import '../chat.css';

/**
 * A room's avatar: the other person for a direct chat, else a coloured tile.
 * Kept apart from Conversation so the header's chat button does not pull the
 * whole conversation view (composer, message list, viewers) into the main bundle.
 */
export function RoomAvatar({ room, size = 40, shape }) {
  if (room.kind === 'direct' && room.other) {
    return (
      <span className="cr-avatar" style={{ width: size, height: size }}>
        <UserAvatar user={room.other} size={size} tip={false} />
        {room.other.online && <i className="cr-online" />}
      </span>
    );
  }
  const color = room.entityInfo?.color || room.color || (room.kind === 'entity' ? '#10B981' : '#6366F1');
  return (
    <Avatar size={size} shape={shape} style={{ background: `linear-gradient(140deg, ${color}, color-mix(in srgb, ${color} 65%, #000))`, flexShrink: 0, fontWeight: 650, fontSize: size * 0.38 }}>
      {room.kind === 'entity' ? '✓' : initials(room.title)}
    </Avatar>
  );
}

export default RoomAvatar;
