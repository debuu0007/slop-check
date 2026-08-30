export async function loadUser(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(String(response.status));
    return response.json();
  } catch (error) {
    throw new Error("User request failed", { cause: error });
  }
}
