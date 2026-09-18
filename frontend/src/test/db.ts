/** Delete the app's IndexedDB database. fake-indexeddb keeps one shared database
 *  across a test file, so call this between tests to stop folders/documents from
 *  leaking from one case into the next. */
export function resetDb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase("qr-studio");
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}
