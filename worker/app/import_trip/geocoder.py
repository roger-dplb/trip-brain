from geopy.exc import GeocoderTimedOut
from geopy.geocoders import Nominatim


def reverse_geocode(lat, lon):
    """
    Reverse geocode a (lat, lon) pair to a location dict.
    Returns { country: str, city: str, region: str|None }.
    Falls back to 'Desconhecido' values on any error.
    """
    try:
        geolocator = Nominatim(user_agent="trip-brain-import/1.0")
        location = geolocator.reverse(f"{lat}, {lon}", timeout=5)

        if not location:
            return {"country": "Desconhecido", "city": "Desconhecido", "region": None}

        address = location.raw.get("address", {})

        country = (address.get("country") or "").strip() or "Desconhecido"
        city = (
            (address.get("city") or "").strip()
            or (address.get("town") or "").strip()
            or (address.get("village") or "").strip()
            or "Desconhecido"
        )
        region = (
            (address.get("state") or "").strip()
            or (address.get("county") or "").strip()
            or None
        )

        return {"country": country, "city": city, "region": region}

    except (GeocoderTimedOut, Exception):
        return {"country": "Desconhecido", "city": "Desconhecido", "region": None}
