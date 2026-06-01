export function CoachAvatar({ size = 54, mood = 'happy' }: { size?: number; mood?: 'happy' | 'think' }) {
  return (
    <div
      className="shrink-0 grid place-items-center relative font-piece font-bold text-white"
      style={{
        width: size,
        height: size,
        borderRadius: '32%',
        fontSize: size * 0.5,
        background: 'linear-gradient(150deg, #2BB495, #157A63)',
        boxShadow: '0 6px 14px -4px rgba(21,122,99,.6), inset 0 1px 0 rgba(255,255,255,.4)',
      }}
    >
      師
      <span
        className="absolute grid place-items-center font-body text-[#4a3208] bg-gold border-2 border-paper rounded-full"
        style={{
          right: -2,
          bottom: -2,
          width: size * 0.34,
          height: size * 0.34,
          fontSize: size * 0.2,
        }}
      >
        {mood === 'think' ? '…' : '✦'}
      </span>
    </div>
  );
}
