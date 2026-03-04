const CONFETTI_PARTICLES = Array.from({ length: 26 }, (_, index) => ({
  left: `${(index * 17) % 100}%`,
  delay: `${(index % 7) * 0.12}s`,
  duration: `${2.1 + (index % 5) * 0.28}s`,
}));

const EMOJI_PARTICLES = Array.from({ length: 12 }, (_, index) => ({
  left: `${6 + ((index * 9) % 88)}%`,
  delay: `${(index % 6) * 0.16}s`,
  duration: `${2.4 + (index % 4) * 0.35}s`,
}));

type CelebrationProps = {
  show: boolean;
};

export function Celebration({ show }: CelebrationProps) {
  if (!show) return null;

  return (
    <div className="celebration-overlay" aria-hidden="true">
      {CONFETTI_PARTICLES.map((piece, index) => (
        <span
          key={`confetti-${index}`}
          className="confetti-piece"
          style={{
            left: piece.left,
            animationDelay: piece.delay,
            animationDuration: piece.duration,
          }}
        />
      ))}
      {EMOJI_PARTICLES.map((piece, index) => (
        <span
          key={`emoji-${index}`}
          className="emoji-drop"
          style={{
            left: piece.left,
            animationDelay: piece.delay,
            animationDuration: piece.duration,
          }}
        >
          🙌
        </span>
      ))}
    </div>
  );
}
