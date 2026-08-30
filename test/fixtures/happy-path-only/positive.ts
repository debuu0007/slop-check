export async function loadUser(url: string) {
  const response = await fetch(url);
  return response.json();
}
