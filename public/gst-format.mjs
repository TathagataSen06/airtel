const gstAlphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function gstCheck(body) {
  let factor = 2;
  let sum = 0;
  for (const char of body.split('').reverse()) {
    const value = gstAlphabet.indexOf(char) * factor;
    sum += Math.floor(value / 36) + value % 36;
    factor = factor === 2 ? 1 : 2;
  }
  return gstAlphabet[(36 - sum % 36) % 36];
}

export function gstinValid(id) {
  return typeof id === 'string' && /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(id) &&
    gstCheck(id.slice(0, -1)) === id.slice(-1);
}
