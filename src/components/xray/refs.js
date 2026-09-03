// Callback-ref factory for the text nodes the frame loop writes to. The loop
// never touches React state for a number; it looks the node up by key and
// diff-writes textContent.
export const textRef = (R, key) => (el) => {
  if (el) R.text.set(key, el);
  else R.text.delete(key);
};
