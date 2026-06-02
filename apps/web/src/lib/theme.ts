/** Apply fixed Jade Court piece style at startup (tokens live in CSS). */
export function applyTheme(): void {
  document.body.classList.remove('pcs-classic', 'pcs-bold', 'pcs-flat');
  document.body.classList.add('pcs-flat');
}
