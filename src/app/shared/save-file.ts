/**
 * Hands a downloaded Blob to the browser as a file. API files need the Authorization header,
 * so they are fetched with HttpClient first instead of a plain `<a href>`.
 */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.hidden = true;
  document.body.append(a); // a detached link loses its file name in Chromium
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
