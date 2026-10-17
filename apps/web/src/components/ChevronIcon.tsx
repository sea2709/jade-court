/**
 * Stroke chevron used for open/close toggles on collapsible room cards.
 */

/** Up chevron means "collapse"; down chevron means "expand". */
export function ChevronIcon({ direction, testId }: { direction: 'up' | 'down'; testId?: string }) {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-testid={testId}
    >
      <path d={direction === 'up' ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
    </svg>
  );
}
