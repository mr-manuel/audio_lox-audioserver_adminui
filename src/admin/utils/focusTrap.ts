function isHidden(el: HTMLElement): boolean {
  // Basic visibility check; avoids trapping on offscreen/hidden controls.
  if (el.hasAttribute('disabled')) return true;
  const style = window.getComputedStyle(el);
  return style.visibility === 'hidden' || style.display === 'none';
}

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const nodes = Array.from(
    container.querySelectorAll<HTMLElement>(
      [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
      ].join(','),
    ),
  );
  return nodes.filter((el) => !isHidden(el) && !el.hasAttribute('aria-hidden'));
}

export function trapFocus(event: KeyboardEvent, container: HTMLElement): void {
  if (event.key !== 'Tab') return;
  const focusables = getFocusableElements(container);
  if (focusables.length === 0) {
    event.preventDefault();
    container.focus();
    return;
  }

  const active = document.activeElement as HTMLElement | null;
  const first = focusables[0]!;
  const last = focusables[focusables.length - 1]!;

  if (!active) {
    event.preventDefault();
    first.focus();
    return;
  }

  if (event.shiftKey) {
    if (active === first || !container.contains(active)) {
      event.preventDefault();
      last.focus();
    }
    return;
  }

  if (active === last || !container.contains(active)) {
    event.preventDefault();
    first.focus();
  }
}

