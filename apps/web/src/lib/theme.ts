const BOARD_BAMBOO = {
  '--board': '#EBC987',
  '--board-2': '#E3BC73',
  '--board-edge': '#B07F44',
  '--grid': '#97632F',
} as const;

const ACCENT_JADE = {
  '--jade': '#1F9E81',
  '--jade-deep': '#157A63',
  '--jade-soft': '#D6EFE7',
} as const;

const BACKGROUND_WARM =
  'radial-gradient(1200px 700px at 80% -10%, #FCEFD2 0%, transparent 60%), radial-gradient(900px 600px at -10% 110%, #F3E6CA 0%, transparent 55%), #FBF3E1';

export function applyTheme(): void {
  const root = document.documentElement.style;
  Object.entries(BOARD_BAMBOO).forEach(([k, v]) => root.setProperty(k, v));
  Object.entries(ACCENT_JADE).forEach(([k, v]) => root.setProperty(k, v));
  root.setProperty('--font-piece', "'Noto Serif SC', serif");
  document.body.style.background = BACKGROUND_WARM;
  document.body.style.backgroundAttachment = 'fixed';
  document.body.classList.remove('pcs-classic', 'pcs-bold', 'pcs-flat');
  document.body.classList.add('pcs-flat');
}
