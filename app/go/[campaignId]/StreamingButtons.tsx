'use client';

declare global {
  interface Window { fbq?: (...args: unknown[]) => void }
}

function firePixel(platform: string, songTitle: string, artistName: string) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'Lead', {
      content_type: 'music',
      content_name: `${songTitle} by ${artistName}`,
      content_category: platform,
    });
  }
}

export function SpotifyButton({ recordUrl, destination, songTitle, artistName }: { recordUrl: string; destination: string; songTitle: string; artistName: string }) {
  function handleClick() {
    firePixel('spotify', songTitle, artistName);
    // Record with a beacon so the click is captured even when the browser (e.g.
    // Meta's in-app browser) jumps straight to the Spotify app and skips our
    // redirect route. Fire-and-forget; survives the navigation.
    try {
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon(recordUrl);
      } else {
        fetch(recordUrl, { keepalive: true }).catch(() => {});
      }
    } catch { /* best-effort tracking */ }
  }
  return (
    <a href={destination} onClick={handleClick}
      className="flex items-center justify-center gap-3 w-full bg-[#1db954] hover:bg-[#1ed760] text-black font-semibold py-4 px-6 rounded-xl transition">
      <SpotifyIcon />
      Listen on Spotify
    </a>
  );
}

export function SpotifyPlaylistButton({ href, destination, songTitle, artistName, primary = false }: {
  href: string; destination: string; songTitle: string; artistName: string; primary?: boolean;
}) {
  function handleClick() {
    firePixel('spotify_playlist', songTitle, artistName);
    if (primary) {
      window.location.href = href;
    } else {
      window.location.href = destination;
    }
  }
  return (
    <a
      href={href}
      onClick={(e) => { e.preventDefault(); handleClick(); }}
      className={primary
        ? 'flex items-center justify-center gap-3 w-full bg-[#1db954] hover:bg-[#1ed760] text-black font-semibold py-4 px-6 rounded-xl transition'
        : 'flex items-center justify-center gap-3 w-full border border-[#1db954]/50 hover:border-[#1db954] hover:bg-[#1db954]/10 text-[#1db954] font-semibold py-4 px-6 rounded-xl transition'
      }
    >
      {primary ? (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
        </svg>
      ) : (
        <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24">
          <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>
        </svg>
      )}
      {primary ? 'Listen on Spotify' : 'Listen on playlist'}
    </a>
  );
}

export function AppleMusicButton({ href, songTitle, artistName }: { href: string; songTitle: string; artistName: string }) {
  return (
    <a href={href} onClick={() => firePixel('apple_music', songTitle, artistName)}
      className="flex items-center justify-center gap-3 w-full bg-gray-800/80 hover:bg-gray-700/80 border border-gray-700/50 backdrop-blur text-white font-semibold py-4 px-6 rounded-xl transition">
      <AppleMusicIcon />
      Apple Music
    </a>
  );
}

export function YouTubeMusicButton({ href, songTitle, artistName }: { href: string; songTitle: string; artistName: string }) {
  return (
    <a href={href} onClick={() => firePixel('youtube_music', songTitle, artistName)}
      className="flex items-center justify-center gap-3 w-full bg-gray-800/80 hover:bg-gray-700/80 border border-gray-700/50 backdrop-blur text-white font-semibold py-4 px-6 rounded-xl transition">
      <YouTubeMusicIcon />
      YouTube Music
    </a>
  );
}

function SpotifyIcon() {
  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}

function AppleMusicIcon() {
  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026C4.786.07 4.043.15 3.34.428 2.004.958 1.04 1.88.475 3.208A7.57 7.57 0 00.09 5.08c-.008.42-.012.84-.012 1.26v11.32c0 .42.004.84.012 1.26.028.87.148 1.73.473 2.52.622 1.5 1.86 2.38 3.34 2.74.87.22 1.76.26 2.65.27.38.01.76.01 1.14.01h11.22c.38 0 .76 0 1.14-.01.89-.01 1.78-.05 2.65-.27 1.48-.36 2.72-1.24 3.34-2.74.32-.79.44-1.65.47-2.52.01-.42.01-.84.01-1.26V6.34c0-.072-.002-.143-.006-.216zm-11.96 14.25c-3.59 0-6.5-2.91-6.5-6.5s2.91-6.5 6.5-6.5 6.5 2.91 6.5 6.5-2.91 6.5-6.5 6.5zm6.78-11.68a1.52 1.52 0 110-3.04 1.52 1.52 0 010 3.04zM12.034 7.5a6.374 6.374 0 100 12.748 6.374 6.374 0 000-12.748zm2.89 9.64l-2.89-1.67-2.89 1.67.76-3.27-2.5-2.17 3.3-.28 1.33-3.1 1.33 3.1 3.3.28-2.5 2.17.76 3.27z" />
    </svg>
  );
}

function YouTubeMusicIcon() {
  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm0 19.104c-3.924 0-7.104-3.18-7.104-7.104S8.076 4.896 12 4.896s7.104 3.18 7.104 7.104-3.18 7.104-7.104 7.104zm0-13.332c-3.432 0-6.228 2.796-6.228 6.228S8.568 18.228 12 18.228s6.228-2.796 6.228-6.228S15.432 5.772 12 5.772zM9.684 15.54V8.46L15.816 12l-6.132 3.54z" />
    </svg>
  );
}
