// ─────────────────────────────────────────────────────────────
//  SpEc — profile config
//  Everything you'd want to tweak lives here. Links set to "#"
//  are placeholders: swap them for your real URLs whenever.
// ─────────────────────────────────────────────────────────────

export const profile = {
  displayName: 'Æon',
  username: 's.p.e_c',
  // little bubble next to the avatar (like a Discord custom status)
  status: 'lost in the city lights',
  bio: '“your value doesn’t decrease because of someone’s inability to see your worth, even if that person is you.”',
  memberSince: '2024-10-06',
  avatar: 'assets/img/avatar.webp',
  banner: 'assets/img/banner.webp',

  // Optional: live Discord presence through Lanyard (https://github.com/Phineas/lanyard).
  // Join the Lanyard Discord server, then paste your Discord user ID here (e.g. '123456789012345678').
  // Leave empty to show the static "idle" moon instead.
  discordId: '',
};

// Badge row under the name. `icon` is a key from icons.js.
export const badges = [
  { icon: 'moon', label: 'Night Owl', color: '#ffd36e' },
  { icon: 'gamepad-2', label: 'Gamer', color: '#7ee8ff' },
  { icon: 'sword', label: 'Warrior', color: '#8affc1' },
  { icon: 'gift', label: 'Gifter', color: '#ff8fd8' },
  { icon: 'music', label: 'Audiophile', color: '#c7a6ff' },
  { icon: 'sparkles', label: 'Early Supporter', color: '#ffb8f0' },
  { icon: 'zap', label: 'Server Booster', color: '#ff7ad9' },
];

// Social icon row. `icon` is a key from icons.js.
// Set `copy` to copy text to the clipboard instead of opening a link.
export const socials = [
  { icon: 'discord', label: 'Discord', copy: 's.p.e_c' },
  { icon: 'youtube', label: 'YouTube', url: '#' },
  { icon: 'tiktok', label: 'TikTok', url: '#' },
  { icon: 'instagram', label: 'Instagram', url: '#' },
  { icon: 'x', label: 'X', url: '#' },
  { icon: 'twitch', label: 'Twitch', url: '#' },
  { icon: 'spotify', label: 'Spotify', url: '#' },
  { icon: 'steam', label: 'Steam', url: '#' },
  { icon: 'github', label: 'GitHub', url: '#' },
];

// "Connections" section (bigger link rows).
export const connections = [
  { icon: 'globe', label: 'dineroshop.xyz', url: 'https://dineroshop.xyz' },
];

// Background music. Add more tracks and the ⏮ ⏭ buttons will cycle them.
export const playlist = [
  { title: 'House Song', artist: 'Searows', src: 'assets/audio/house-song.mp3' },
];

// Scene defaults.
export const sceneDefaults = {
  weather: 'rain', // 'rain' | 'snow' | 'clear'
  rainSound: true, // soft synthesized rain under the music
  volume: 0.45,
};
