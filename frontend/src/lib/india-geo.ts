/**
 * Indian States, Cities, Pincodes & Address data utilities.
 *
 * Address search:  PRIMARY  — OLA Maps Places Autocomplete API (api.olamaps.io)
 *                             India-native, high coverage, returns structured terms
 *                             with pincode, city, state embedded in each prediction.
 *                  FALLBACK — Photon (Komoot) + Nominatim (OpenStreetMap) in parallel,
 *                             used when OLA Maps is unavailable / rate-limited.
 *
 * Pincodes:        India Post API (api.postalpincode.in) — free, no key.
 *                  Fetches post offices + pincodes for a given city.
 */

// ─── OLA Maps API key (set in frontend/.env as VITE_OLA_MAPS_API_KEY) ───
const OLA_MAPS_API_KEY = (import.meta as any).env?.VITE_OLA_MAPS_API_KEY as string | undefined;

// ─── Indian States (all 28 states + 8 UTs) ─────────────────────────────
export const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  // Union Territories
  'Andaman & Nicobar Islands',
  'Chandigarh',
  'Dadra & Nagar Haveli and Daman & Diu',
  'Delhi',
  'Jammu & Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
] as const;

export type IndianState = (typeof INDIAN_STATES)[number];

// ─── Static cities per state (top cities — used as fallback) ────────────
const CITIES_BY_STATE: Record<string, string[]> = {
  'Andhra Pradesh': ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Kurnool', 'Rajahmundry', 'Tirupati', 'Kakinada', 'Kadapa', 'Anantapur', 'Eluru', 'Ongole', 'Chittoor', 'Machilipatnam', 'Srikakulam'],
  'Arunachal Pradesh': ['Itanagar', 'Naharlagun', 'Pasighat', 'Tawang', 'Ziro', 'Bomdila', 'Along', 'Tezu'],
  'Assam': ['Guwahati', 'Silchar', 'Dibrugarh', 'Jorhat', 'Nagaon', 'Tinsukia', 'Tezpur', 'Bongaigaon', 'Karimganj', 'Goalpara'],
  'Bihar': ['Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur', 'Purnia', 'Darbhanga', 'Arrah', 'Begusarai', 'Katihar', 'Munger', 'Chhapra', 'Bettiah', 'Saharsa', 'Hajipur'],
  'Chhattisgarh': ['Raipur', 'Bhilai', 'Bilaspur', 'Korba', 'Durg', 'Rajnandgaon', 'Jagdalpur', 'Raigarh', 'Ambikapur'],
  'Goa': ['Panaji', 'Margao', 'Vasco da Gama', 'Mapusa', 'Ponda', 'Bicholim'],
  'Gujarat': ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar', 'Jamnagar', 'Junagadh', 'Gandhinagar', 'Anand', 'Nadiad', 'Mehsana', 'Morbi', 'Bharuch', 'Vapi', 'Navsari', 'Porbandar', 'Gandhidham', 'Palanpur'],
  'Haryana': ['Gurugram', 'Faridabad', 'Panipat', 'Ambala', 'Yamunanagar', 'Rohtak', 'Hisar', 'Karnal', 'Sonipat', 'Panchkula', 'Bhiwani', 'Sirsa', 'Rewari', 'Jind', 'Bahadurgarh', 'Kurukshetra'],
  'Himachal Pradesh': ['Shimla', 'Mandi', 'Solan', 'Dharamsala', 'Kullu', 'Manali', 'Bilaspur', 'Hamirpur', 'Una', 'Palampur', 'Nahan'],
  'Jharkhand': ['Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro', 'Hazaribagh', 'Deoghar', 'Giridih', 'Ramgarh', 'Dumka'],
  'Karnataka': ['Bengaluru', 'Mysuru', 'Mangaluru', 'Hubli-Dharwad', 'Belagavi', 'Kalaburagi', 'Davanagere', 'Bellary', 'Shimoga', 'Tumkur', 'Raichur', 'Bidar', 'Udupi', 'Hassan', 'Mandya'],
  'Kerala': ['Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Thrissur', 'Kollam', 'Palakkad', 'Alappuzha', 'Kannur', 'Malappuram', 'Kottayam', 'Kasaragod'],
  'Madhya Pradesh': ['Bhopal', 'Indore', 'Jabalpur', 'Gwalior', 'Ujjain', 'Sagar', 'Dewas', 'Satna', 'Ratlam', 'Rewa', 'Singrauli', 'Murwara', 'Chhindwara', 'Burhanpur', 'Khandwa'],
  'Maharashtra': ['Mumbai', 'Pune', 'Nagpur', 'Thane', 'Nashik', 'Aurangabad', 'Solapur', 'Kolhapur', 'Amravati', 'Navi Mumbai', 'Sangli', 'Malegaon', 'Jalgaon', 'Akola', 'Latur', 'Ahmednagar', 'Dhule', 'Chandrapur', 'Parbhani', 'Ichalkaranji', 'Jalna', 'Nanded', 'Satara', 'Ratnagiri'],
  'Manipur': ['Imphal', 'Thoubal', 'Bishnupur', 'Churachandpur', 'Kakching'],
  'Meghalaya': ['Shillong', 'Tura', 'Nongstoin', 'Jowai', 'Baghmara'],
  'Mizoram': ['Aizawl', 'Lunglei', 'Champhai', 'Serchhip', 'Kolasib'],
  'Nagaland': ['Kohima', 'Dimapur', 'Mokokchung', 'Tuensang', 'Wokha', 'Zunheboto'],
  'Odisha': ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Berhampur', 'Sambalpur', 'Puri', 'Balasore', 'Baripada', 'Bhadrak', 'Jharsuguda', 'Jeypore'],
  'Punjab': ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Bathinda', 'Mohali', 'Pathankot', 'Hoshiarpur', 'Moga', 'Batala', 'Abohar', 'Muktsar', 'Malerkotla', 'Khanna', 'Phagwara'],
  'Rajasthan': ['Jaipur', 'Jodhpur', 'Kota', 'Bikaner', 'Ajmer', 'Udaipur', 'Bhilwara', 'Alwar', 'Bharatpur', 'Sikar', 'Sri Ganganagar', 'Pali', 'Tonk', 'Kishangarh', 'Beawar', 'Hanumangarh', 'Nagaur', 'Jhunjhunu', 'Chittorgarh', 'Churu'],
  'Sikkim': ['Gangtok', 'Namchi', 'Gyalshing', 'Mangan', 'Rangpo'],
  'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli', 'Erode', 'Vellore', 'Thoothukudi', 'Tiruppur', 'Thanjavur', 'Dindigul', 'Nagercoil', 'Cuddalore', 'Kanchipuram', 'Karur'],
  'Telangana': ['Hyderabad', 'Warangal', 'Nizamabad', 'Karimnagar', 'Khammam', 'Ramagundam', 'Mahbubnagar', 'Nalgonda', 'Adilabad', 'Siddipet', 'Miryalaguda'],
  'Tripura': ['Agartala', 'Udaipur', 'Dharmanagar', 'Kailashahar', 'Ambassa'],
  'Uttar Pradesh': ['Lucknow', 'Kanpur', 'Agra', 'Varanasi', 'Meerut', 'Prayagraj', 'Ghaziabad', 'Noida', 'Bareilly', 'Aligarh', 'Moradabad', 'Saharanpur', 'Gorakhpur', 'Jhansi', 'Muzaffarnagar', 'Mathura', 'Firozabad', 'Ayodhya', 'Shahjahanpur', 'Rampur', 'Etawah', 'Mirzapur'],
  'Uttarakhand': ['Dehradun', 'Haridwar', 'Rishikesh', 'Haldwani', 'Roorkee', 'Kashipur', 'Rudrapur', 'Nainital', 'Mussoorie', 'Almora', 'Pithoragarh'],
  'West Bengal': ['Kolkata', 'Howrah', 'Asansol', 'Siliguri', 'Durgapur', 'Bardhaman', 'Malda', 'Baharampur', 'Habra', 'Kharagpur', 'Haldia', 'Raiganj', 'Krishnanagar', 'Kalyani', 'Balurghat'],
  // Union Territories
  'Andaman & Nicobar Islands': ['Port Blair', 'Diglipur', 'Rangat', 'Mayabunder'],
  'Chandigarh': ['Chandigarh'],
  'Dadra & Nagar Haveli and Daman & Diu': ['Silvassa', 'Daman', 'Diu'],
  'Delhi': ['New Delhi', 'Delhi', 'Dwarka', 'Rohini', 'Saket', 'Laxmi Nagar', 'Karol Bagh', 'Pitampura', 'Janakpuri', 'Shahdara'],
  'Jammu & Kashmir': ['Srinagar', 'Jammu', 'Anantnag', 'Baramulla', 'Sopore', 'Kathua', 'Udhampur', 'Pulwama'],
  'Ladakh': ['Leh', 'Kargil'],
  'Lakshadweep': ['Kavaratti', 'Agatti', 'Minicoy'],
  'Puducherry': ['Puducherry', 'Karaikal', 'Mahe', 'Yanam'],
};

/**
 * Get cities for a given state. Returns the static curated list.
 */
export function getCitiesForState(state: string): string[] {
  return CITIES_BY_STATE[state] || [];
}

// ─── Address Search ──────────────────────────────────────────────────────
// Strategy:
//   1. OLA Maps Autocomplete (primary) — India-native, fast, structured terms
//   2. Photon + Nominatim in parallel (fallback) — free OSM-based, no key needed

export interface AddressSuggestion {
  display_name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  lat: string;
  lon: string;
  place_id?: string;   // OLA Maps place_id — for future place-details calls
}

/** Resolve any state name variation to a canonical Indian state string */
function matchIndianState(raw: string): string {
  if (!raw) return '';
  const lower = raw.toLowerCase().trim();
  const exact = INDIAN_STATES.find(s => s.toLowerCase() === lower);
  if (exact) return exact;
  const aliases: Record<string, string> = {
    'nct of delhi': 'Delhi',
    'national capital territory of delhi': 'Delhi',
    'orissa': 'Odisha',
    'uttaranchal': 'Uttarakhand',
    'pondicherry': 'Puducherry',
    'andaman and nicobar islands': 'Andaman & Nicobar Islands',
    'andaman and nicobar': 'Andaman & Nicobar Islands',
    'dadra and nagar haveli and daman and diu': 'Dadra & Nagar Haveli and Daman & Diu',
    'jammu and kashmir': 'Jammu & Kashmir',
    'j&k': 'Jammu & Kashmir',
  };
  if (aliases[lower]) return aliases[lower];
  const partial = INDIAN_STATES.find(
    s => lower.includes(s.toLowerCase()) || s.toLowerCase().includes(lower),
  );
  return partial || raw;
}

/**
 * Search Indian addresses.
 * Uses OLA Maps as primary source; falls back to Photon + Nominatim if unavailable.
 */
export async function searchAddress(query: string): Promise<AddressSuggestion[]> {
  if (!query || query.length < 3) return [];

  // Try OLA Maps first (primary)
  if (OLA_MAPS_API_KEY) {
    try {
      const olaMapsResults = await searchViaOlaMaps(query);
      if (olaMapsResults.length > 0) return olaMapsResults;
    } catch {
      // fall through to OSM fallback
    }
  }

  // Fallback: Photon + Nominatim in parallel
  const [photon, nominatim] = await Promise.allSettled([
    searchViaPhoton(query),
    searchViaNominatim(query),
  ]);

  const photonList = photon.status === 'fulfilled' ? photon.value : [];
  const nominatimList = nominatim.status === 'fulfilled' ? nominatim.value : [];

  const seen = new Set<string>();
  const merged: AddressSuggestion[] = [];

  for (const item of [...photonList, ...nominatimList]) {
    if (!item.address && !item.display_name) continue;
    const key = item.lat && item.lon
      ? `${parseFloat(item.lat).toFixed(4)},${parseFloat(item.lon).toFixed(4)}`
      : `${item.address}|${item.city}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  return merged.slice(0, 10);
}

// ─── OLA Maps Places Autocomplete ────────────────────────────────────────
// API: https://api.olamaps.io/places/v1/autocomplete
// Each prediction contains:
//   description  — full human-readable address
//   geometry     — { location: { lat, lng } }
//   place_id     — for fetching full details later
//   terms[]      — ordered address tokens; last = "India", second-to-last = pincode (if present),
//                  before that = state-level terms; city is usually terms[-3] or terms[-2]
async function searchViaOlaMaps(query: string): Promise<AddressSuggestion[]> {
  const encoded = encodeURIComponent(query);
  const url =
    `https://api.olamaps.io/places/v1/autocomplete` +
    `?input=${encoded}&api_key=${OLA_MAPS_API_KEY}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return [];

  const data = await res.json();
  if (!data.predictions?.length) return [];

  const results: AddressSuggestion[] = [];

  for (const p of data.predictions as OlaPrediction[]) {
    const terms: string[] = (p.terms || []).map((t: { value: string }) => t.value);

    // OLA Maps terms are ordered: [name, ...address parts, city, state, pincode?, "India"]
    // Strip "India" from the end; then last = pincode (if 6-digit), next = state, next = city
    const filtered = terms.filter(t => t !== 'India');

    let pincode = '';
    let state = '';
    let city = '';

    // Walk from the end to extract pincode, state, city
    const tail = [...filtered].reverse();
    let idx = 0;

    // First non-India token: 6-digit pincode?
    if (/^\d{6}$/.test(tail[idx] ?? '')) {
      pincode = tail[idx++];
    }
    // Next: state (match against canonical list)
    if (tail[idx]) {
      const candidate = matchIndianState(tail[idx]);
      if (candidate && INDIAN_STATES.includes(candidate as any)) {
        state = candidate;
        idx++;
      }
    }
    // Next: city
    if (tail[idx]) {
      city = tail[idx++];
    }

    // Build address: everything before the city/state/pincode tokens
    const addrTerms = filtered.slice(0, filtered.length - idx);
    const addressStr = addrTerms.join(', ') || p.description.split(',')[0];

    const lat = String(p.geometry?.location?.lat ?? '');
    const lon = String(p.geometry?.location?.lng ?? '');

    results.push({
      display_name: p.description,
      address: addressStr,
      city,
      state,
      pincode,
      lat,
      lon,
      place_id: p.place_id,
    });
  }

  return results.slice(0, 10);
}

// OLA Maps prediction shape (relevant fields only)
interface OlaPrediction {
  description: string;
  place_id: string;
  terms: { offset: number; value: string }[];
  geometry: { location: { lat: number; lng: number } };
}

// ─── Photon (Komoot) ─────────────────────────────────────────────────────
// Better for: localities, markets, areas, POIs — India coverage is strong
// Does NOT append ", India" — that skews locality searches badly
async function searchViaPhoton(query: string): Promise<AddressSuggestion[]> {
  try {
    // Bias results toward centre of India (lat=22.5, lon=78.96)
    // osm_tag filters include: place, amenity, shop, building — broad coverage
    const encoded = encodeURIComponent(query);
    const res = await fetch(
      `https://photon.komoot.io/api/?q=${encoded}&limit=8&lang=en&lat=22.5&lon=78.96&location_bias_scale=0.4`,
      { signal: AbortSignal.timeout(4000) },
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.features?.length) return [];

    const results: AddressSuggestion[] = [];

    for (const feature of data.features) {
      const props = feature.properties || {};
      // Filter to India only
      if (props.countrycode && props.countrycode !== 'IN') continue;
      if (props.country && !['India', 'IN'].includes(props.country)) continue;

      // Build a meaningful address string — prefer name + street over just name
      const nameParts = [
        props.name,
        props.street ? `${props.street}` : null,
        props.housenumber ? `#${props.housenumber}` : null,
      ].filter(Boolean);

      // For places without a street, add locality/district context
      if (nameParts.length <= 1) {
        if (props.locality) nameParts.push(props.locality);
        if (props.district && props.district !== props.name) nameParts.push(props.district);
      }

      const addressStr = nameParts.join(', ') || props.name || '';
      if (!addressStr) continue;

      const cityName =
        props.city || props.town || props.village ||
        props.municipality || props.county || props.district || '';
      const stateName = matchIndianState(props.state || '');
      const pincode = props.postcode || '';

      const coords = feature.geometry?.coordinates || [];
      results.push({
        display_name: [addressStr, cityName, stateName].filter(Boolean).join(', '),
        address: addressStr,
        city: cityName,
        state: stateName,
        pincode,
        lat: String(coords[1] ?? ''),
        lon: String(coords[0] ?? ''),
      });
    }
    return results;
  } catch {
    return [];
  }
}

// ─── Nominatim (OpenStreetMap) ────────────────────────────────────────────
// Better for: structured addresses, pincodes, large areas
async function searchViaNominatim(query: string): Promise<AddressSuggestion[]> {
  try {
    const encoded = encodeURIComponent(query);
    // featuretype=all, dedupe=1 reduces duplicates from Nominatim itself
    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?q=${encoded}&format=json&addressdetails=1` +
      `&countrycodes=in&limit=8&dedupe=1` +
      `&accept-language=en`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'BahiKhataPro/1.0 (business-registration)' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();

    return (data as any[]).map((item) => {
      const addr = item.address || {};

      // Build address from most specific to least specific parts
      const parts = [
        addr.amenity,
        addr.shop,
        addr.building,
        addr.road,
        addr.neighbourhood,
        addr.suburb,
        addr.village,
        addr.hamlet,
      ].filter(Boolean);

      const stateName = matchIndianState(addr.state || '');
      const cityName =
        addr.city || addr.town || addr.village ||
        addr.county || addr.state_district || '';

      const addressStr =
        parts.join(', ') ||
        item.display_name.split(',').slice(0, 3).join(', ').trim();

      return {
        display_name: item.display_name,
        address: addressStr,
        city: cityName,
        state: stateName,
        pincode: addr.postcode || '',
        lat: item.lat,
        lon: item.lon,
      };
    });
  } catch {
    return [];
  }
}

// ─── Pincode Lookup (India Post API) ────────────────────────────────────

export interface PincodeInfo {
  pincode: string;
  officeName: string;  // Post office name e.g. "Connaught Place"
  district: string;
  state: string;
}

/**
 * Fetch pincodes for a city using the India Post API.
 * Returns list of post offices with their pincodes.
 * API: https://api.postalpincode.in/postoffice/{cityName}
 */
export async function fetchPincodesForCity(city: string): Promise<PincodeInfo[]> {
  if (!city || city.length < 2) return [];
  try {
    const encoded = encodeURIComponent(city);
    const res = await fetch(`https://api.postalpincode.in/postoffice/${encoded}`);
    if (!res.ok) return [];
    const data = await res.json();

    // API returns an array with one element: { Message, Status, PostOffice[] }
    if (!data?.[0]?.PostOffice?.length) return [];

    const seen = new Set<string>();
    const results: PincodeInfo[] = [];

    for (const po of data[0].PostOffice) {
      // Deduplicate by pincode
      if (seen.has(po.Pincode)) continue;
      seen.add(po.Pincode);

      results.push({
        pincode: po.Pincode,
        officeName: po.Name,
        district: po.District,
        state: po.State,
      });
    }

    // Sort by pincode
    results.sort((a, b) => a.pincode.localeCompare(b.pincode));
    return results;
  } catch {
    return [];
  }
}
