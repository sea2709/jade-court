export function CoachAvatar({ size = 54, mood = 'happy' }: { size?: number; mood?: 'happy' | 'think' }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '32%',
        flex: '0 0 auto',
        display: 'grid',
        placeItems: 'center',
        position: 'relative',
        fontFamily: 'var(--font-piece)',
        fontWeight: 700,
        color: '#fff',
        fontSize: size * 0.5,
        background: 'linear-gradient(150deg, #2BB495, #157A63)',
        boxShadow: '0 6px 14px -4px rgba(21,122,99,.6), inset 0 1px 0 rgba(255,255,255,.4)',
      }}
    >
      師
      <span
        style={{
          position: 'absolute',
          right: -2,
          bottom: -2,
          width: size * 0.34,
          height: size * 0.34,
          borderRadius: '50%',
          background: 'var(--gold)',
          border: '2px solid var(--paper)',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'var(--font-body)',
          fontSize: size * 0.2,
          color: '#4a3208',
        }}
      >
        {mood === 'think' ? '…' : '✦'}
      </span>
    </div>
  );
}
