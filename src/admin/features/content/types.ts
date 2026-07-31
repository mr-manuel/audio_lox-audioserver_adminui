export type ContentFilterKey =
  | 'radio'
  | 'library'
  | 'streaming'
  | 'linein'
  // Last: a section most installations never open, and the only one about hardware rather than
  // about music.
  | 'sonnclient';
