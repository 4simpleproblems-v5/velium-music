import requests
import json

def get_data():
    try:
        print("Searching for artist...")
        # 1. Search for artist
        search_res = requests.get("https://jiosaavn-api-privatecvc2.vercel.app/search/artists?query=The+Weeknd").json()
        
        if not search_res.get("data") or not search_res["data"].get("results"):
             print("No artist found in search results.")
             print(json.dumps(search_res, indent=2))
             return
        
        artist_id = search_res["data"]["results"][0]["id"]
        print(f"Artist ID: {artist_id}")

        # 2. Get Artist Details
        print("\nGetting artist details...")
        artist_details = requests.get(f"https://jiosaavn-api-privatecvc2.vercel.app/artists?id={artist_id}").json()
        
        if not artist_details.get("data"):
            print("No artist details found.")
            print(json.dumps(artist_details, indent=2))
            return
            
        artist_name = artist_details["data"]["name"]
        print(f"Artist Name: {artist_name}")
        
        # 3. Get Artist Songs
        print("\nGetting artist songs (paginated)...")
        songs_res = requests.get(f"https://jiosaavn-api-privatecvc2.vercel.app/artists/{artist_id}/songs?page=1&limit=5").json()
        
        print("\nFull songs_res response:")
        print(json.dumps(songs_res, indent=2))

        if "data" in songs_res and "results" in songs_res["data"]:
            songs = songs_res["data"]["results"]
            if not songs:
                print("Songs results list is empty.")
                return

            print(f"\nFound {len(songs)} songs.")
            for s in songs:
                p_artists = s.get("primaryArtists", "N/A")
                artist_field = s.get("artist", "N/A") # This 'artist' field is sometimes a simplified string or an object in other contexts.
                name = s.get("name", "N/A")
                
                print(f"Song: {name}")
                print(f"  - primaryArtists: '{p_artists}'")
                print(f"  - artist (field): '{artist_field}'")
                if isinstance(s.get("artists"), list): # Sometimes 'artists' is an array of objects
                    print(f"  - artists (list): {[a.get('name') for a in s['artists']]}")
        else:
            print("No 'data' or 'results' in songs_res.")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    get_data()