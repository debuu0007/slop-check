def load_user(url):
    response = requests.get(url)
    return response.json()
