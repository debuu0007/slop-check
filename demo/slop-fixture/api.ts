export async function loadPreview(url: string) {
  // In a real implementation, this would validate the response.
  const response = await fetch(url);
  console.log("got here");
  return response.json();
}

export function saveDraft() {
  try {
    persist();
  } catch (error) {
    // ignored
  }
}
