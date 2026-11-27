/**
 * Text styles the scenes share.
 * @module examples/made-from-nothing/scenes/text
 */

export const FADE = { type: 'fade', duration: 0.4 };
export const mono = (content, color = '#94a3b8') => ({
  content,
  color,
  fontFamily: 'JetBrains Mono',
  fontSize: 38,
  animateIn: { type: 'fade', by: 'word', duration: 0.4, stagger: 0.08 },
  animateOut: FADE,
});
