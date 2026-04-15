export default function buildServices(i18nT, mode) {
  return {
    youtube: {
      name: 'YouTube',
      examples: [
        i18nT('placeholders.youtubeUrl'),
        'https://www.youtube.com/watch?v=PsO6ZnUZI0g',
        'https://youtu.be/PsO6ZnUZI0g',
        'https://www.youtube.com/shorts/PsO6ZnUZI0g',
      ],
      icon: 'youtube',
      yColor: '#df2f2f',
    },
    reddit: {
      name: 'Reddit',
      examples: [
        i18nT('placeholders.redditUrl'),
        'https://www.reddit.com/r/aww/comments/abc123/cute_puppy/',
        'https://redd.it/abc123',
        'https://www.reddit.com/comments/abc123',
      ],
      icon: 'reddit',
      yColor: '#ff4500',
    },
    x: {
      name: 'X/Twitter',
      examples: [
        i18nT('placeholders.xUrl'),
        'https://x.com/elonmusk/status/1234567890123456789',
        'https://twitter.com/elonmusk/status/1234567890123456789',
        'https://x.com/i/status/1234567890123456789',
      ],
      icon: 'x',
      yColor: mode === 'dark' ? '#ffffff' : '#000000',
    },
    generic: {
      name: 'Generic',
      examples: [
        i18nT('placeholders.genericUrl'),
        'https://www.example.com/video/12345',
        'https://vimeo.com/123456789',
        'https://www.dailymotion.com/video/x8abc12',
        'https://www.twitch.tv/videos/1234567890',
      ],
      icon: 'generic',
      yColor: '#6366f1',
    },
  }
}
